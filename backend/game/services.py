"""Game rules live here so views stay thin and the server is the single source of truth."""
from django.utils import timezone

from .models import PlayerProfile, ResourceNode

OFFLINE_CAP_SECONDS = 8 * 60 * 60   # production stops accruing after 8 hours away
OFFLINE_REPORT_THRESHOLD = 120      # only show the "welcome back" banner after 2+ minutes away
CLICK_VALUE = 1.0
MAX_CLICKS_PER_REQUEST = 50


def node_cost(node, level):
    return node.base_cost * (node.cost_multiplier ** level)


def node_yield(node, level):
    return node.base_yield * level


def get_locked_profile(user):
    """Fetch (or create) the profile and lock the row. Call inside transaction.atomic()."""
    PlayerProfile.objects.get_or_create(user=user)
    return PlayerProfile.objects.select_for_update().get(user=user)


def settle(profile, now=None):
    """Add the resources each producer made since last_active.

    Returns (produced, elapsed): a list of {resource, amount} and the seconds counted.
    """
    now = now or timezone.now()
    elapsed = max(0.0, (now - profile.last_active).total_seconds())
    elapsed = min(elapsed, OFFLINE_CAP_SECONDS)

    produced = []
    for pn in profile.owned_nodes.select_related('node'):
        if pn.level <= 0:
            continue
        amount = node_yield(pn.node, pn.level) * profile.prestige_multiplier * elapsed
        if amount <= 0:
            continue
        pn.stock += amount
        pn.save(update_fields=['stock'])
        produced.append({'resource': pn.node.resource_label, 'amount': amount})

    profile.last_active = now
    profile.save(update_fields=['last_active'])
    return produced, elapsed


def serialize_state(profile, offline_earned=None):
    owned = {pn.node_id: pn for pn in profile.owned_nodes.all()}
    nodes = []
    for node in ResourceNode.objects.order_by('base_cost', 'id'):
        pn = owned.get(node.id)
        level = pn.level if pn else 0
        stock = pn.stock if pn else 0.0
        nodes.append({
            'id': node.id,
            'level': level,
            'stock': stock,
            'current_cost': node_cost(node, level),
            'yield_per_sec': node_yield(node, level) * profile.prestige_multiplier,
            'resource_label': node.resource_label,
            'sell_price': node.sell_price,
            'node': {
                'id': node.id,
                'name': node.name,
                'icon': node.icon,
                'base_yield': node.base_yield,
            },
        })
    return {
        'currency': profile.currency,
        'prestige_multiplier': profile.prestige_multiplier,
        'offline_earned': offline_earned or [],
        'nodes': nodes,
    }