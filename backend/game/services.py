"""Game rules live here so views stay thin and the server is the single source of truth."""
from django.utils import timezone

from .models import PlayerProfile, ResourceNode

OFFLINE_CAP_SECONDS = 8 * 60 * 60   # production stops accruing after 8 hours away
OFFLINE_REPORT_THRESHOLD = 120      # only show the "welcome back" banner after 2+ minutes away
CLICK_VALUE = 1.0
MAX_CLICKS_PER_REQUEST = 50
MAX_NODE_LEVEL = 50

DEFAULT_SPAWN_INTERVAL = 3          # seconds between pickups for producers without a custom interval
MAX_COLLECT_PER_ENTRY = 100         # max pickups claimed per producer in one request

RESOURCE_CATALOG = [
    # name, base_cost, cost_multiplier, base_yield, spawn_interval, icon, resource_label, sell_price
    ("Apple Orchard", 10, 1.15, 1 / 15, 15, "apple", "Apples", 0.5),
    ("Lumber Camp", 100, 1.15, 1 / 30, 30, "tree", "Wood", 2.0),
    ("Stone Quarry", 1100, 1.15, 5.0, DEFAULT_SPAWN_INTERVAL, "mountain", "Stone", 5.0),
    ("Blacksmith", 12000, 1.15, 3.0, DEFAULT_SPAWN_INTERVAL, "hammer", "Tools", 50.0),
]


def node_cost(node, level):
    return node.base_cost * (node.cost_multiplier ** level)


def node_yield(node, level):
    return node.base_yield * level


def item_value(node, level, prestige=1.0):
    """How many units one pickup is worth for this producer's spawn interval."""
    return node_yield(node, level) * prestige * node.spawn_interval


def get_locked_profile(user):
    """Fetch (or create) the profile and lock the row. Call inside transaction.atomic()."""
    PlayerProfile.objects.get_or_create(user=user)
    return PlayerProfile.objects.select_for_update().get(user=user)


def ensure_resource_catalog():
    """Create the standard producers if this database has not been seeded yet."""
    for name, base_cost, cost_multiplier, base_yield, spawn_interval, icon, resource_label, sell_price in RESOURCE_CATALOG:
        ResourceNode.objects.get_or_create(
            name=name,
            defaults={
                'base_cost': base_cost,
                'cost_multiplier': cost_multiplier,
                'base_yield': base_yield,
                'spawn_interval': spawn_interval,
                'icon': icon,
                'resource_label': resource_label,
                'sell_price': sell_price,
            },
        )


def settle(profile, now=None):
    """Add the output each producer made since last_active to its `pending` pile.

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
        pn.pending += amount
        pn.save(update_fields=['pending'])
        produced.append({'resource': pn.node.resource_label, 'amount': amount})

    profile.last_active = now
    profile.save(update_fields=['last_active'])
    return produced, elapsed


def serialize_state(profile, offline_earned=None):
    ensure_resource_catalog()
    owned = {pn.node_id: pn for pn in profile.owned_nodes.all()}
    nodes = []
    for node in ResourceNode.objects.order_by('base_cost', 'id'):
        pn = owned.get(node.id)
        level = pn.level if pn else 0
        yield_per_sec = node_yield(node, level) * profile.prestige_multiplier
        nodes.append({
            'id': node.id,
            'level': level,
            'max_level': MAX_NODE_LEVEL,
            'stock': pn.stock if pn else 0.0,
            'pending': pn.pending if pn else 0.0,
            'item_value': yield_per_sec * node.spawn_interval,
            'spawn_interval': node.spawn_interval,
            'current_cost': node_cost(node, level),
            'yield_per_sec': yield_per_sec,
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
