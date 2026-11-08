from django.db import migrations


def remove_empty_producer_rows(apps, schema_editor):
    PlayerNode = apps.get_model('game', 'PlayerNode')
    PlayerNode.objects.filter(level__lte=0).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0012_limit_producer_levels_to_ten'),
    ]

    operations = [
        migrations.RunPython(remove_empty_producer_rows, migrations.RunPython.noop),
        migrations.AlterUniqueTogether(
            name='playernode',
            unique_together=set(),
        ),
    ]
