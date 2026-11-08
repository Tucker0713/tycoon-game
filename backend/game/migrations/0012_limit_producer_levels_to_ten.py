from django.db import migrations


def clamp_producer_levels(apps, schema_editor):
    PlayerNode = apps.get_model('game', 'PlayerNode')
    PlayerNode.objects.filter(level__gt=10).update(level=10)


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0011_quarry_blacksmith_production_intervals'),
    ]

    operations = [
        migrations.RunPython(clamp_producer_levels, migrations.RunPython.noop),
    ]
