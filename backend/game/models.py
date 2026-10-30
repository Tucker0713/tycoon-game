from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class PlayerProfile(models.Model):
    """Player wallet + prestige. `last_active` is the last time earnings were settled."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    currency = models.FloatField(default=0.0)
    prestige_multiplier = models.FloatField(default=1.0)
    # NOTE: no auto_now. We set this ourselves in services.settle() so offline math is correct.
    last_active = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"{self.user.username}'s Profile (Wallet: {self.currency:.2f})"


class ResourceNode(models.Model):
    """Catalog of purchasable businesses/nodes."""
    name = models.CharField(max_length=100)
    base_cost = models.FloatField(default=10.0)
    cost_multiplier = models.FloatField(default=1.15)
    base_yield = models.FloatField(default=1.0)
    icon = models.CharField(max_length=50, default="factory")

    def __str__(self):
        return self.name


class PlayerNode(models.Model):
    """Which nodes a player owns and at what level."""
    player = models.ForeignKey(PlayerProfile, on_delete=models.CASCADE, related_name='owned_nodes')
    node = models.ForeignKey(ResourceNode, on_delete=models.CASCADE)
    level = models.IntegerField(default=0)

    class Meta:
        unique_together = ('player', 'node')

    def __str__(self):
        return f"{self.player.user.username} - {self.node.name} (Lvl {self.level})"