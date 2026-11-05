from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class PlayerProfile(models.Model):
    """Player wallet + prestige. `last_active` is the last time production was settled."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    currency = models.FloatField(default=0.0)
    prestige_multiplier = models.FloatField(default=1.0)
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

    class Meta:
        unique_together = ('player', 'node')

    def __str__(self):
        return f"{self.player.user.username} - {self.node.name} (Lvl {self.level})"
