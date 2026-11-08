from django.db import migrations


def update_production_intervals(apps, schema_editor):
    ResourceNode = apps.get_model('game', 'ResourceNode')
    ResourceNode.objects.filter(name='Stone Quarry').update(
        base_yield=1 / 45,
        spawn_interval=45,
    )
    ResourceNode.objects.filter(name='Blacksmith').update(
        base_yield=1 / 60,
        spawn_interval=60,
    )


def restore_production_intervals(apps, schema_editor):
    ResourceNode = apps.get_model('game', 'ResourceNode')
    ResourceNode.objects.filter(name='Stone Quarry').update(
        base_yield=5.0,
        spawn_interval=3,
    )
    ResourceNode.objects.filter(name='Blacksmith').update(
        base_yield=3.0,
        spawn_interval=3,
    )


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0010_player_level_and_upgrade_points'),
    ]

    operations = [
        migrations.RunPython(update_production_intervals, restore_production_intervals),
    ]
