from django.db import migrations


NODES = [
    # name, base_cost, cost_multiplier, base_yield, icon, resource_label, sell_price
    ("Apple Orchard", 10, 1.15, 1.0, "apple", "Apples", 0.5),
    ("Lumber Camp", 100, 1.15, 2.0, "tree", "Wood", 2.0),
    ("Stone Quarry", 1100, 1.15, 5.0, "mountain", "Stone", 5.0),
    ("Blacksmith", 12000, 1.15, 3.0, "hammer", "Tools", 50.0),
]


def seed_resource_catalog(apps, schema_editor):
    ResourceNode = apps.get_model("game", "ResourceNode")
    for name, base_cost, cost_multiplier, base_yield, icon, resource_label, sell_price in NODES:
        ResourceNode.objects.update_or_create(
            name=name,
            defaults={
                "base_cost": base_cost,
                "cost_multiplier": cost_multiplier,
                "base_yield": base_yield,
                "icon": icon,
                "resource_label": resource_label,
                "sell_price": sell_price,
            },
        )


class Migration(migrations.Migration):
    dependencies = [("game", "0003_playernode_stock_resourcenode_resource_label_and_more")]

    operations = [migrations.RunPython(seed_resource_catalog, migrations.RunPython.noop)]
