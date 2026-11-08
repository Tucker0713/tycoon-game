from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class PlayerProfile(models.Model):
    """Player wallet + prestige. `last_active` is the last time production was settled."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    currency = models.FloatField(default=0.0)
    prestige_multiplier = models.FloatField(default=1.0)
    spawn_amount_upgrade_level = models.IntegerField(default=0)
    node_amount_upgrade_level = models.IntegerField(default=0)
    apple_picker_level = models.IntegerField(default=0)
    wood_picker_level = models.IntegerField(default=0)
    stone_picker_level = models.IntegerField(default=0)
    tool_picker_level = models.IntegerField(default=0)
    apple_picker_speed_level = models.IntegerField(default=0)
    wood_picker_speed_level = models.IntegerField(default=0)
    stone_picker_speed_level = models.IntegerField(default=0)
    tool_picker_speed_level = models.IntegerField(default=0)
    player_level = models.IntegerField(default=0)
    level_xp = models.FloatField(default=0.0)
    upgrade_points = models.IntegerField(default=0)
    prestige_count = models.IntegerField(default=0)
    total_clicks = models.PositiveIntegerField(default=0)
    total_resources_collected = models.FloatField(default=0.0)
    total_resources_sold = models.FloatField(default=0.0)
    total_producers_purchased = models.PositiveIntegerField(default=0)
    claimed_achievements = models.JSONField(default=list, blank=True)
    daily_quest_date = models.DateField(null=True, blank=True)
    daily_quest_data = models.JSONField(default=list, blank=True)
    active_boost_started_at = models.DateTimeField(null=True, blank=True)
    active_boost_until = models.DateTimeField(null=True, blank=True)
    last_active = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.user.username}'s Profile (Wallet: {self.currency:.2f})"


class ResourceNode(models.Model):
    """A producer (Apple Orchard, Lumber Camp, ...). Each makes one resource that can be sold."""
    name = models.CharField(max_length=100)
    base_cost = models.FloatField(default=10.0)        # gold cost of level 1
    cost_multiplier = models.FloatField(default=1.15)  # cost of next level = base_cost * multiplier ** level
    base_yield = models.FloatField(default=1.0)        # units of the resource per second, per level
    spawn_interval = models.IntegerField(default=3)    # seconds between visible pickups
    icon = models.CharField(max_length=50, default="factory")
    resource_label = models.CharField(max_length=50, default="Goods")  # e.g. "Apples"
    sell_price = models.FloatField(default=1.0)        # gold per unit when sold at the market

    def __str__(self):
        return self.name


class PlayerNode(models.Model):
    """Which producers a player owns, their level, and their collected stock / uncollected output."""
    player = models.ForeignKey(PlayerProfile, on_delete=models.CASCADE, related_name='owned_nodes')
    node = models.ForeignKey(ResourceNode, on_delete=models.CASCADE)
    level = models.IntegerField(default=0)
    stock = models.FloatField(default=0.0)    # collected, sellable at the market
    pending = models.FloatField(default=0.0)  # produced but not yet collected (the pickups on the field)

    def __str__(self):
        return f"{self.player.user.username} - {self.node.name} (Lvl {self.level})"
