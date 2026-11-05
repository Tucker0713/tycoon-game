from django.db import migrations, models


def set_orchard_production(apps, schema_editor):
    ResourceNode = apps.get_model("game", "ResourceNode")
    ResourceNode.objects.filter(name="Apple Orchard").update(
        base_yield=0.3,
        spawn_interval=10,
    )


class Migration(migrations.Migration):
    dependencies = [("game", "0005_playernode_pending")]

    operations = [
        migrations.AddField(
            model_name="resourcenode",
            name="spawn_interval",
            field=models.IntegerField(default=3),
        ),
        migrations.RunPython(set_orchard_production, migrations.RunPython.noop),
    ]
