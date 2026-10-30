from django.core.management.base import BaseCommand
from game.models import ResourceNode

NODES = [
    # name, base_cost, cost_multiplier, base_yield, icon
    ("Apple Orchard", 10, 1.15, 0.5, "apple"),
    ("Lumber Camp", 100, 1.15, 4, "tree"),
    ("Stone Quarry", 1100, 1.15, 25, "mountain"),
    ("Blacksmith", 12000, 1.15, 150, "hammer"),
]


class Command(BaseCommand):
    help = "Create or update the ResourceNode catalog."

    def handle(self, *args, **options):
        for name, cost, mult, yld, icon in NODES:
            _, created = ResourceNode.objects.update_or_create(
                name=name,
                defaults=dict(base_cost=cost, cost_multiplier=mult, base_yield=yld, icon=icon),
            )
            self.stdout.write(f"{'Created' if created else 'Updated'}: {name}")