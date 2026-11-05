from django.db import migrations


def set_orchard_production(apps, schema_editor):
    ResourceNode = apps.get_model("game", "ResourceNode")
    ResourceNode.objects.filter(name="Apple Orchard").update(
        base_yield=1 / 15,
        spawn_interval=15,
    )


class Migration(migrations.Migration):
    dependencies = [("game", "0006_resource_node_spawn_interval")]

    operations = [migrations.RunPython(set_orchard_production, migrations.RunPython.noop)]
