"""Game rules live here so views stay thin and the server is the single source of truth."""
from django.utils import timezone
from datetime import datetime, timedelta, timezone as datetime_timezone
import math

from .models import PlayerProfile, ResourceNode

OFFLINE_CAP_SECONDS = 8 * 60 * 60   # production stops accruing after 8 hours away
OFFLINE_REPORT_THRESHOLD = 120      # only show the "welcome back" banner after 2+ minutes away
CLICK_VALUE = 1.0
MAX_CLICKS_PER_REQUEST = 50
MAX_NODE_LEVEL = 10
MAX_UPGRADE_LEVEL = 10
MAX_PICKERS_PER_TYPE = 5
MAX_PICKER_SPEED_LEVEL = 10
HELPER_BASE_COSTS = {
    'apple_picker': 25.0,
    'wood_picker': 500.0,
    'stone_picker': 5500.0,
    'tool_picker': 60000.0,
}
HELPER_SPEED_BASE_COSTS = {
    'apple_picker': 50.0,
    'wood_picker': 1000.0,
    'stone_picker': 11000.0,
    'tool_picker': 120000.0,
}
HELPER_SPEED_FIELDS = {
    'apple_picker': 'apple_picker_speed_level',
    'wood_picker': 'wood_picker_speed_level',
    'stone_picker': 'stone_picker_speed_level',
    'tool_picker': 'tool_picker_speed_level',
}
UPGRADE_POINT_COSTS = {
    'spawn_amount': 1,
    'node_amount': 1,
}

DEFAULT_SPAWN_INTERVAL = 3          # seconds between pickups for producers without a custom interval
MAX_COLLECT_PER_ENTRY = 100         # max pickups claimed per producer in one request
NODE_UNLOCK_LEVELS = {'Apple Orchard': 0, 'Lumber Camp': 2, 'Stone Quarry': 4, 'Blacksmith': 6}
HELPER_UNLOCK_LEVELS = {'apple_picker': 0, 'wood_picker': 2, 'stone_picker': 4, 'tool_picker': 6}
BOOST_COST = 1000
BOOST_DURATION_SECONDS = 5 * 60
MARKET_CYCLE_SECONDS = 6 * 60 * 60

DAILY_QUEST_TEMPLATES = [
    {'id': 'collect', 'title': 'Gather Supplies', 'description': 'Collect {target} resources.', 'target': 20, 'reward': 100},
    {'id': 'sell', 'title': 'Trade Day', 'description': 'Sell {target} resources.', 'target': 10, 'reward': 150},
    {'id': 'click', 'title': 'Coin Collector', 'description': 'Click Spawn Coins {target} times.', 'target': 25, 'reward': 75},
]

ACHIEVEMENT_DEFINITIONS = [
    {'id': 'first_click', 'title': 'First Coin', 'description': 'Spawn your first coin.', 'stat': 'total_clicks', 'target': 1, 'reward': 25},
    {'id': 'click_100', 'title': 'Coin Enthusiast', 'description': 'Spawn 100 coins.', 'stat': 'total_clicks', 'target': 100, 'reward': 250},
    {'id': 'first_producer', 'title': 'Village Builder', 'description': 'Purchase your first producer.', 'stat': 'total_producers_purchased', 'target': 1, 'reward': 50},
    {'id': 'collect_100', 'title': 'Busy Hands', 'description': 'Collect 100 resources.', 'stat': 'total_resources_collected', 'target': 100, 'reward': 250},
    {'id': 'sell_100', 'title': 'Merchant', 'description': 'Sell 100 resources.', 'stat': 'total_resources_sold', 'target': 100, 'reward': 350},
    {'id': 'prestige_1', 'title': 'A New Beginning', 'description': 'Prestige for the first time.', 'stat': 'prestige_count', 'target': 1, 'reward': 500},
]

RESOURCE_CATALOG = [
    # name, base_cost, cost_multiplier, base_yield, spawn_interval, icon, resource_label, sell_price
    ("Apple Orchard", 10, 1.15, 1 / 15, 15, "apple", "Apples", 0.5),
    ("Lumber Camp", 100, 1.15, 1 / 30, 30, "tree", "Wood", 2.0),
    ("Stone Quarry", 1100, 1.15, 1 / 45, 45, "mountain", "Stone", 5.0),
    ("Blacksmith", 12000, 1.15, 1 / 60, 60, "hammer", "Tools", 50.0),
]


def node_cost(node, level):
    return node.base_cost * (node.cost_multiplier ** level)


def node_yield(node, level):
    return node.base_yield * level


def item_value(node):
    """Each visible resource pickup represents one item."""
    return node.base_yield * node.spawn_interval


def upgrade_cost(upgrade_type, level):
    return UPGRADE_POINT_COSTS[upgrade_type]


def helper_cost(helper_type, level):
    return math.ceil(HELPER_BASE_COSTS[helper_type] * (1.6 ** level))


def helper_speed_cost(helper_type, level):
    return math.ceil(HELPER_SPEED_BASE_COSTS[helper_type] * (1.6 ** level))


def helper_pickup_interval(helper_type, picker_count, speed_level):
    return (10 / max(picker_count, 1)) * (0.9 ** speed_level)


def xp_to_next_level(level):
    return math.ceil(50 * (2.5 ** level))


def award_xp(profile, amount):
    profile.level_xp += amount
    while profile.level_xp >= xp_to_next_level(profile.player_level):
        profile.level_xp -= xp_to_next_level(profile.player_level)
        profile.player_level += 1
        profile.upgrade_points += (profile.player_level + 9) // 10


def max_node_copies(profile):
    return 1 + profile.node_amount_upgrade_level


def ensure_daily_quests(profile, now=None):
    now = now or timezone.localdate()
    if profile.daily_quest_date == now and profile.daily_quest_data:
        return profile.daily_quest_data
    profile.daily_quest_date = now
    profile.daily_quest_data = [
        {**quest, 'description': quest['description'].format(target=quest['target']), 'progress': 0, 'claimed': False}
        for quest in DAILY_QUEST_TEMPLATES
    ]
    profile.save(update_fields=['daily_quest_date', 'daily_quest_data'])
    return profile.daily_quest_data


def advance_quest(profile, quest_id, amount):
    quests = ensure_daily_quests(profile)
    for quest in quests:
        if quest['id'] == quest_id:
            quest['progress'] = min(quest['target'], quest['progress'] + amount)
            break
    profile.daily_quest_data = quests


def market_state(now=None):
    now = now or timezone.now()
    cycle_number = int(now.timestamp() // MARKET_CYCLE_SECONDS)
    active_index = cycle_number % len(RESOURCE_CATALOG)
    cycle_end = datetime.fromtimestamp((cycle_number + 1) * MARKET_CYCLE_SECONDS, tz=datetime_timezone.utc)
    return active_index, cycle_end


def market_multiplier(node, now=None):
    active_index, _ = market_state(now)
    node_index = next((index for index, item in enumerate(RESOURCE_CATALOG) if item[0] == node.name), 0)
    return 1.5 if node_index == active_index else 0.85


def achievement_state(profile):
    claimed = set(profile.claimed_achievements or [])
    return [
        {**achievement,
         'progress': min(getattr(profile, achievement['stat']), achievement['target']),
         'unlocked': getattr(profile, achievement['stat']) >= achievement['target'],
         'claimed': achievement['id'] in claimed}
        for achievement in ACHIEVEMENT_DEFINITIONS
    ]


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
    boosted_elapsed = 0.0
    if profile.active_boost_started_at and profile.active_boost_until:
        credited_start = max(profile.last_active, now - timedelta(seconds=OFFLINE_CAP_SECONDS))
        boost_start = max(credited_start, profile.active_boost_started_at)
        boost_end = min(now, profile.active_boost_until)
        boosted_elapsed = max(0.0, (boost_end - boost_start).total_seconds())

    produced = []
    for pn in profile.owned_nodes.select_related('node'):
        if pn.level <= 0:
            continue
        amount = (
            node_yield(pn.node, pn.level)
            * profile.prestige_multiplier
            * (elapsed + boosted_elapsed)
        )
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
    now = timezone.now()
    demand_index, market_cycle_ends = market_state(now)
    demand_node = list(ResourceNode.objects.order_by('base_cost', 'id'))[demand_index]
    boost_active = bool(profile.active_boost_until and profile.active_boost_until > now)
    quests = ensure_daily_quests(profile)
    owned_by_node = {}
    for pn in profile.owned_nodes.select_related('node').order_by('id'):
        owned_by_node.setdefault(pn.node_id, []).append(pn)
    nodes = []
    spawn_amount_level = profile.spawn_amount_upgrade_level
    node_amount_level = profile.node_amount_upgrade_level
    for node in ResourceNode.objects.order_by('base_cost', 'id'):
        unlock_level = NODE_UNLOCK_LEVELS.get(node.name, 0)
        current_market_multiplier = market_multiplier(node, now)
        instances = owned_by_node.get(node.id, [])
        for index, pn in enumerate(instances, start=1):
            level = pn.level
            yield_per_sec = node_yield(node, level) * profile.prestige_multiplier * (2 if boost_active else 1)
            nodes.append({
                'id': pn.id,
                'player_node_id': pn.id,
                'is_placeholder': False,
                'instance_number': index,
                'level': level,
                'max_level': MAX_NODE_LEVEL,
                'stock': pn.stock,
                'pending': pn.pending,
                'item_value': item_value(node),
                'spawn_interval': node.spawn_interval,
                'current_cost': node_cost(node, level),
                'yield_per_sec': yield_per_sec,
                'resource_label': node.resource_label,
                'sell_price': node.sell_price * current_market_multiplier,
                'base_sell_price': node.sell_price,
                'market_multiplier': current_market_multiplier,
                'unlock_level': unlock_level,
                'node': {
                    'id': node.id,
                    'name': node.name,
                    'icon': node.icon,
                    'base_yield': node.base_yield,
                },
            })

        max_copies = max_node_copies(profile)
        for slot in range(len(instances), max_copies):
            instance_number = slot + 1
            yield_per_sec = 0.0
            nodes.append({
                'id': -(node.id * 100 + instance_number),
                'player_node_id': None,
                'is_placeholder': True,
                'instance_number': instance_number,
                'level': 0,
                'max_level': MAX_NODE_LEVEL,
                'stock': 0.0,
                'pending': 0.0,
                'item_value': 0.0,
                'spawn_interval': node.spawn_interval,
                'current_cost': node_cost(node, len(instances)),
                'yield_per_sec': yield_per_sec,
                'resource_label': node.resource_label,
                'sell_price': node.sell_price * current_market_multiplier,
                'base_sell_price': node.sell_price,
                'market_multiplier': current_market_multiplier,
                'unlock_level': unlock_level,
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
        'prestige_count': profile.prestige_count,
        'prestige_available': profile.player_level >= 10,
        'market': {
            'demand_resource': demand_node.resource_label,
            'cycle_ends_at': market_cycle_ends.isoformat(),
        },
        'boost': {
            'active': boost_active,
            'ends_at': profile.active_boost_until.isoformat() if boost_active else None,
            'cost': BOOST_COST,
            'duration_seconds': BOOST_DURATION_SECONDS,
        },
        'quests': quests,
        'achievements': achievement_state(profile),
        'offline_earned': offline_earned or [],
        'nodes': nodes,
        'upgrades': {
            'spawn_amount': {
                'level': spawn_amount_level,
                'max_level': MAX_UPGRADE_LEVEL,
                'point_cost': upgrade_cost('spawn_amount', spawn_amount_level),
                'effect_value': 1 + spawn_amount_level,
            },
            'node_amount': {
                'level': node_amount_level,
                'max_level': MAX_UPGRADE_LEVEL,
                'point_cost': upgrade_cost('node_amount', node_amount_level),
                'effect_value': max_node_copies(profile),
            },
        },
        'helpers': {
            helper_type: {
                'level': getattr(profile, level_field),
                'max_level': MAX_PICKERS_PER_TYPE,
                'current_cost': helper_cost(helper_type, getattr(profile, level_field)),
                'speed_level': getattr(profile, HELPER_SPEED_FIELDS[helper_type]),
                'max_speed_level': MAX_PICKER_SPEED_LEVEL,
                'speed_cost': helper_speed_cost(helper_type, getattr(profile, HELPER_SPEED_FIELDS[helper_type])),
                'pickup_interval': helper_pickup_interval(
                    helper_type,
                    getattr(profile, level_field),
                    getattr(profile, HELPER_SPEED_FIELDS[helper_type]),
                ),
                'unlock_level': HELPER_UNLOCK_LEVELS[helper_type],
            }
            for helper_type, level_field in {
                'apple_picker': 'apple_picker_level',
                'wood_picker': 'wood_picker_level',
                'stone_picker': 'stone_picker_level',
                'tool_picker': 'tool_picker_level',
            }.items()
        },
        'player_level': profile.player_level,
        'level_xp': profile.level_xp,
        'xp_to_next_level': xp_to_next_level(profile.player_level),
        'upgrade_points': profile.upgrade_points,
    }
