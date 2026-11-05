from django.core.management.base import BaseCommand
from game.models import ResourceNode

NODES = [
    # name, base_cost, cost_multiplier, base_yield, spawn_interval, icon, resource_label, sell_price
    ("Apple Orchard", 10, 1.15, 1 / 15, 15, "apple", "Apples", 0.5),
    ("Lumber Camp", 100, 1.15, 1 / 30, 30, "tree", "Wood", 2.0),
    ("Stone Quarry", 1100, 1.15, 5.0, 3, "mountain", "Stone", 5.0),
    ("Blacksmith", 12000, 1.15, 3.0, 3, "hammer", "Tools", 50.0),
]


class Command(BaseCommand):
    help = "Create or update the ResourceNode catalog."

    def handle(self, *args, **options):
        for name, cost, mult, yld, interval, icon, label, price in NODES:
            _, created = ResourceNode.objects.update_or_create(
                name=name,
                defaults=dict(
                    base_cost=cost, cost_multiplier=mult, base_yield=yld, spawn_interval=interval,
                    icon=icon, resource_label=label, sell_price=price,
                ),
            )
            self.stdout.write(f"{'Created' if created else 'Updated'}: {name}")
