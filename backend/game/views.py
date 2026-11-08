from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from datetime import timedelta
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
    """Buy another producer copy or upgrade an owned copy using gold."""
    try:
        node = ResourceNode.objects.get(pk=int(request.data.get('node_id')))
    except (TypeError, ValueError):
        return Response({'error': 'node_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
    except ResourceNode.DoesNotExist:
        return Response({'error': 'Node not found.'}, status=status.HTTP_404_NOT_FOUND)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)
        unlock_level = services.NODE_UNLOCK_LEVELS.get(node.name, 0)
        if profile.player_level < unlock_level:
            body = services.serialize_state(profile)
            body['error'] = f'{node.name} unlocks at player level {unlock_level}.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        action = request.data.get('action', 'upgrade')

        if action == 'purchase':
            owned_count = profile.owned_nodes.filter(node=node).count()
            if owned_count >= services.max_node_copies(profile):
                body = services.serialize_state(profile)
                body['error'] = 'Unlock another resource node slot first.'
                return Response(body, status=status.HTTP_400_BAD_REQUEST)
            cost = services.node_cost(node, owned_count)
            if profile.currency < cost:
                body = services.serialize_state(profile)
                body['error'] = 'Not enough gold.'
                return Response(body, status=status.HTTP_400_BAD_REQUEST)

            profile.currency -= cost
            profile.total_producers_purchased += 1
            profile.save(update_fields=['currency', 'total_producers_purchased'])
            PlayerNode.objects.create(player=profile, node=node, level=1)
            return Response(services.serialize_state(profile))

        if action != 'upgrade':
            return Response({'error': 'Action must be purchase or upgrade.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            player_node_id = int(request.data.get('player_node_id'))
        except (TypeError, ValueError):
            return Response({'error': 'player_node_id is required for upgrades.'}, status=status.HTTP_400_BAD_REQUEST)

        owned = profile.owned_nodes.filter(pk=player_node_id, node=node).first()
        if owned is None:
            return Response({'error': 'Producer copy not found.'}, status=status.HTTP_404_NOT_FOUND)
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
    """Collect spawned pickups. Body: {items: [{player_node_id, count}, ...]}.

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
                player_node_id = int(entry.get('player_node_id'))
                count = int(entry.get('count', 1))
            except (TypeError, ValueError):
                continue
            count = max(0, min(count, services.MAX_COLLECT_PER_ENTRY))
            if count == 0:
                continue

            pn = profile.owned_nodes.select_related('node').filter(pk=player_node_id, level__gt=0).first()
            if pn is None:
                continue

            value = services.item_value(pn.node)
            amount = min(count * value, pn.pending)
            pn.pending -= amount
            pn.stock += amount
            pn.save(update_fields=['pending', 'stock'])
            profile.total_resources_collected += amount
            services.advance_quest(profile, 'collect', amount)
            services.award_xp(profile, amount)

        profile.save(update_fields=['player_level', 'level_xp', 'upgrade_points', 'total_resources_collected', 'daily_quest_data', 'daily_quest_date'])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sell_view(request):
    """Sell stockpiled resources for gold by producer copy or sell everything."""
    sell_all = bool(request.data.get('all'))
    player_node_id = request.data.get('player_node_id')

    if player_node_id is None and not sell_all:
        return Response({'error': 'Provide player_node_id or all=true.'}, status=status.HTTP_400_BAD_REQUEST)
    if player_node_id is not None:
        try:
            player_node_id = int(player_node_id)
        except (TypeError, ValueError):
            return Response({'error': 'player_node_id must be an integer.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)

        owned = profile.owned_nodes.select_related('node').filter(stock__gt=0)
        if player_node_id is not None:
            owned = owned.filter(pk=player_node_id)

        earned = 0.0
        resources_sold = 0.0
        for pn in owned:
            earned += pn.stock * pn.node.sell_price * services.market_multiplier(pn.node)
            resources_sold += pn.stock
            pn.stock = 0.0
            pn.save(update_fields=['stock'])

        profile.currency += earned
        profile.total_resources_sold += resources_sold
        services.advance_quest(profile, 'sell', resources_sold)
        services.award_xp(profile, resources_sold + earned / 50)
        profile.save(update_fields=['currency', 'player_level', 'level_xp', 'upgrade_points', 'total_resources_sold', 'daily_quest_data', 'daily_quest_date'])
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
        gold_earned = clicks * services.CLICK_VALUE * profile.prestige_multiplier
        profile.total_clicks += clicks
        services.advance_quest(profile, 'click', clicks)
        services.award_xp(profile, clicks + gold_earned / 50)
        profile.save(update_fields=['currency', 'player_level', 'level_xp', 'upgrade_points', 'total_clicks', 'daily_quest_data', 'daily_quest_date'])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def buy_upgrade_view(request):
    """Buy one level of a personal upgrade with upgrade points."""
    upgrade_type = request.data.get('upgrade_type')
    upgrade_fields = {
        'spawn_amount': 'spawn_amount_upgrade_level',
        'node_amount': 'node_amount_upgrade_level',
    }
    if upgrade_type not in upgrade_fields:
        return Response({'error': 'Unknown upgrade type.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)
        level_field = upgrade_fields[upgrade_type]
        level = getattr(profile, level_field)
        cost = services.upgrade_cost(upgrade_type, level)

        if level >= services.MAX_UPGRADE_LEVEL:
            body = services.serialize_state(profile)
            body['error'] = 'This upgrade is already at max level.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        if profile.upgrade_points < cost:
            body = services.serialize_state(profile)
            body['error'] = 'Not enough upgrade points.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        profile.upgrade_points -= cost
        setattr(profile, level_field, level + 1)
        profile.save(update_fields=['upgrade_points', level_field])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def buy_helper_view(request):
    """Buy one helper level with gold."""
    helper_type = request.data.get('helper_type')
    helper_fields = {
        'apple_picker': 'apple_picker_level',
        'wood_picker': 'wood_picker_level',
        'stone_picker': 'stone_picker_level',
        'tool_picker': 'tool_picker_level',
    }
    if helper_type not in helper_fields:
        return Response({'error': 'Unknown helper type.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)
        required_level = services.HELPER_UNLOCK_LEVELS[helper_type]
        if profile.player_level < required_level:
            body = services.serialize_state(profile)
            body['error'] = f'{helper_type.replace("_", " ").title()} unlocks at player level {required_level}.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        level_field = helper_fields[helper_type]
        level = getattr(profile, level_field)
        if level >= services.MAX_PICKERS_PER_TYPE:
            body = services.serialize_state(profile)
            body['error'] = 'This helper is already at max level.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        cost = services.helper_cost(helper_type, level)
        if profile.currency < cost:
            body = services.serialize_state(profile)
            body['error'] = 'Not enough gold.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        profile.currency -= cost
        setattr(profile, level_field, level + 1)
        profile.save(update_fields=['currency', level_field])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upgrade_helper_speed_view(request):
    helper_type = request.data.get('helper_type')
    if helper_type not in services.HELPER_SPEED_FIELDS:
        return Response({'error': 'Unknown helper type.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)
        helper_field = {
            'apple_picker': 'apple_picker_level',
            'wood_picker': 'wood_picker_level',
            'stone_picker': 'stone_picker_level',
            'tool_picker': 'tool_picker_level',
        }[helper_type]
        required_level = services.HELPER_UNLOCK_LEVELS[helper_type]
        if profile.player_level < required_level:
            body = services.serialize_state(profile)
            body['error'] = f'{helper_type.replace("_", " ").title()} unlocks at player level {required_level}.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        if getattr(profile, helper_field) <= 0:
            body = services.serialize_state(profile)
            body['error'] = 'Hire at least one picker from the Upgrades tab first.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        speed_field = services.HELPER_SPEED_FIELDS[helper_type]
        speed_level = getattr(profile, speed_field)
        if speed_level >= services.MAX_PICKER_SPEED_LEVEL:
            body = services.serialize_state(profile)
            body['error'] = 'This picker type is already at max speed.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        cost = services.helper_speed_cost(helper_type, speed_level)
        if profile.currency < cost:
            body = services.serialize_state(profile)
            body['error'] = 'Not enough gold.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        profile.currency -= cost
        setattr(profile, speed_field, speed_level + 1)
        profile.save(update_fields=['currency', speed_field])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def claim_quest_view(request):
    quest_id = request.data.get('quest_id')
    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        quests = services.ensure_daily_quests(profile)
        quest = next((item for item in quests if item['id'] == quest_id), None)
        if quest is None:
            return Response({'error': 'Quest not found.'}, status=status.HTTP_404_NOT_FOUND)
        if quest['claimed'] or quest['progress'] < quest['target']:
            body = services.serialize_state(profile)
            body['error'] = 'Complete the quest before claiming its reward.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        quest['claimed'] = True
        profile.daily_quest_data = quests
        profile.currency += quest['reward']
        profile.save(update_fields=['daily_quest_data', 'currency'])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def claim_achievement_view(request):
    achievement_id = request.data.get('achievement_id')
    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        achievement = next((item for item in services.achievement_state(profile) if item['id'] == achievement_id), None)
        if achievement is None:
            return Response({'error': 'Achievement not found.'}, status=status.HTTP_404_NOT_FOUND)
        if achievement['claimed'] or not achievement['unlocked']:
            body = services.serialize_state(profile)
            body['error'] = 'Unlock the achievement before claiming its reward.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        profile.claimed_achievements = [*(profile.claimed_achievements or []), achievement_id]
        profile.currency += achievement['reward']
        profile.save(update_fields=['claimed_achievements', 'currency'])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activate_boost_view(request):
    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        now = timezone.now()
        services.settle(profile, now)
        if profile.active_boost_until and profile.active_boost_until > now:
            body = services.serialize_state(profile)
            body['error'] = 'A production boost is already active.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        if profile.currency < services.BOOST_COST:
            body = services.serialize_state(profile)
            body['error'] = 'Not enough gold to activate the boost.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)
        profile.currency -= services.BOOST_COST
        profile.active_boost_started_at = now
        profile.active_boost_until = now + timedelta(seconds=services.BOOST_DURATION_SECONDS)
        profile.save(update_fields=['currency', 'active_boost_started_at', 'active_boost_until'])
        return Response(services.serialize_state(profile))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def prestige_view(request):
    with transaction.atomic():
        profile = services.get_locked_profile(request.user)
        services.settle(profile)
        if profile.player_level < 10:
            body = services.serialize_state(profile)
            body['error'] = 'Reach player level 10 to prestige.'
            return Response(body, status=status.HTTP_400_BAD_REQUEST)

        profile.owned_nodes.all().delete()
        profile.currency = 0
        profile.prestige_count += 1
        profile.prestige_multiplier += 0.5
        profile.player_level = 0
        profile.level_xp = 0
        profile.upgrade_points = 0
        profile.spawn_amount_upgrade_level = 0
        profile.node_amount_upgrade_level = 0
        profile.apple_picker_level = 0
        profile.wood_picker_level = 0
        profile.stone_picker_level = 0
        profile.tool_picker_level = 0
        profile.apple_picker_speed_level = 0
        profile.wood_picker_speed_level = 0
        profile.stone_picker_speed_level = 0
        profile.tool_picker_speed_level = 0
        profile.active_boost_started_at = None
        profile.active_boost_until = None
        profile.last_active = timezone.now()
        profile.save(update_fields=[
            'currency', 'prestige_count', 'prestige_multiplier', 'player_level', 'level_xp', 'upgrade_points',
            'spawn_amount_upgrade_level', 'node_amount_upgrade_level', 'apple_picker_level', 'wood_picker_level',
            'stone_picker_level', 'tool_picker_level', 'apple_picker_speed_level', 'wood_picker_speed_level',
            'stone_picker_speed_level', 'tool_picker_speed_level', 'active_boost_started_at', 'active_boost_until', 'last_active',
        ])
        return Response(services.serialize_state(profile))
