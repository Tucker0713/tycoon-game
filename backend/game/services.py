"""Game rules live here so views stay thin and the server is the single source of truth."""
from django.db import transaction
from django.utils import timezone

from .models import PlayerProfile, ResourceNode

OFFLINE_CAP_SECONDS = 8 * 60 * 60   # offline earnings stop after 8 hours
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


def production_per_sec(profile):
    total = sum(
        node_yield(pn.node, pn.level)
        for pn in profile.owned_nodes.select_related('node')
    )
    return total * profile.prestige_multiplier


def settle(profile, now=None):
    """Add earnings accrued since last_active (online or offline). Returns amount earned."""
    now = now or timezone.now()
    elapsed = max(0.0, (now - profile.last_active).total_seconds())
    elapsed = min(elapsed, OFFLINE_CAP_SECONDS)
    earned = production_per_sec(profile) * elapsed
    profile.currency += earned
    profile.last_active = now
    profile.save(update_fields=['currency', 'last_active'])
    return earned


def serialize_state(profile, offline_earned=0.0):
    levels = {pn.node_id: pn.level for pn in profile.owned_nodes.all()}
    nodes, total = [], 0.0
    for node in ResourceNode.objects.order_by('base_cost', 'id'):
        level = levels.get(node.id, 0)
        y = node_yield(node, level) * profile.prestige_multiplier
        total += y
        nodes.append({
            'id': node.id,
            'level': level,
            'current_cost': node_cost(node, level),
            'yield_per_sec': y,
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
        'production_per_sec': total,
        'offline_earned': offline_earned,
        'nodes': nodes,
    }