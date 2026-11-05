from django.db import migrations


def set_lumber_camp_production(apps, schema_editor):
    ResourceNode = apps.get_model("game", "ResourceNode")
    ResourceNode.objects.filter(name="Lumber Camp").update(
        base_yield=1 / 30,
        spawn_interval=30,
    )


class Migration(migrations.Migration):
    dependencies = [("game", "0007_orchard_production_rate")]

    operations = [migrations.RunPython(set_lumber_camp_production, migrations.RunPython.noop)]
