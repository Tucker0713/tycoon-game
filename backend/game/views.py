from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from . import services
from .models import PlayerNode, PlayerProfile, ResourceNode


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def register_user(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''

    if not username or not password:
        return Response({'error': 'Username and password required'}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already taken'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(password, user=User(username=username))
    except ValidationError as e:
        return Response({'error': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, password=password)
    PlayerProfile.objects.get_or_create(user=user)
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'username': user.username,
        'message': 'Registration successful!',
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_user(request):
    username = (request.data.get('username') or '').strip()
    password = request.data.get('password') or ''

    if not username or not password:
        return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

    user = authenticate(username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid username or password.'}, status=status.HTTP_400_BAD_REQUEST)

    PlayerProfile.objects.get_or_create(user=user)
    token, _ = Token.objects.get_or_create(user=user)

    return Response({
        'token': token.key,
        'username': user.username,
        'is_superuser': user.is_superuser,
        'message': 'Login successful!',
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def game_state_view(request):
    """Settle production since last visit and return the full game state."""
    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        produced, elapsed = services.settle(profile)
        # Only report "while you were away" for real absences, not the 30s auto-refresh.
        offline = produced if elapsed >= services.OFFLINE_REPORT_THRESHOLD else []
        return Response(services.serialize_state(profile, offline_earned=offline))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def buy_node_view(request):
    """Buy one level of a producer with gold. The server checks the price."""
    try:
        node = ResourceNode.objects.get(pk=int(request.data.get('node_id')))
    except (TypeError, ValueError):
        return Response({'error': 'node_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
    except ResourceNode.DoesNotExist:
        return Response({'error': 'Node not found.'}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)  # credit production at the OLD level before upgrading

        owned, _ = PlayerNode.objects.get_or_create(player=profile, node=node)
        cost = services.node_cost(node, owned.level)

        if owned.level >= services.MAX_NODE_LEVEL:
            body = services.serialize_state(profile)
            body['error'] = 'This producer is already at max level.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        if profile.currency < cost:
            body = services.serialize_state(profile)
            body['error'] = 'Not enough gold.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        profile.currency -= cost
        profile.save(update_fields=['currency'])
        owned.level += 1
        owned.save(update_fields=['level'])

        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def collect_view(request):
    """Collect spawned pickups. Body: {items: [{node_id, count}, ...]}.

    Each pickup moves one producer interval of output from `pending` to `stock`. The server never
    moves more than the producer has actually made, so the client can't invent resources.
    """
    items = request.data.get('items')
    if not isinstance(items, list):
        return Response({'error': 'items must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)

        for entry in items:
            if not isinstance(entry, dict):
                continue
            try:
                node_id = int(entry.get('node_id'))
                count = int(entry.get('count', 1))
            except (TypeError, ValueError):
                continue
            count = max(0, min(count, services.MAX_COLLECT_PER_ENTRY))
            if count == 0:
                continue

            pn = profile.owned_nodes.select_related('node').filter(node_id=node_id, level__gt=0).first()
            if pn is None:
                continue

            value = services.item_value(pn.node, pn.level, profile.prestige_multiplier)
            amount = min(count * value, pn.pending)
            pn.pending -= amount
            pn.stock += amount
            pn.save(update_fields=['pending', 'stock'])

        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sell_view(request):
    """Sell stockpiled resources for gold. Send {node_id} for one resource or {all: true} for everything."""
    sell_all = bool(request.data.get('all'))
    node_id = request.data.get('node_id')

    if node_id is None and not sell_all:
        return Response({'error': 'Provide node_id or all=true.'}, status=status.HTTP_400_BAD_REQUEST)
    if node_id is not None:
        try:
            node_id = int(node_id)
        except (TypeError, ValueError):
            return Response({'error': 'node_id must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)

        owned = profile.owned_nodes.select_related('node').filter(stock__gt=0)
        if node_id is not None:
            owned = owned.filter(node_id=node_id)

        earned = 0.0
        for pn in owned:
            earned += pn.stock * pn.node.sell_price
            pn.stock = 0.0
            pn.save(update_fields=['stock'])

        profile.currency += earned
        profile.save(update_fields=['currency'])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def gather_view(request):
    """Credit manual clicks (as gold). The client batches clicks; the server clamps the batch size."""
    try:
        clicks = int(request.data.get('clicks', 1))
    except (TypeError, ValueError):
        return Response({'error': 'clicks must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)
    clicks = max(0, min(clicks, services.MAX_CLICKS_PER_REQUEST))

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)
        profile.currency += clicks * services.CLICK_VALUE * profile.prestige_multiplier
        profile.save(update_fields=['currency'])
        return Response(services.serialize_state(profile))
