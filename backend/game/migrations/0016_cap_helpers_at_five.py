from django.db import migrations


def cap_picker_counts(apps, schema_editor):
    PlayerProfile = apps.get_model('game', 'PlayerProfile')
    for field in (
        'apple_picker_level',
        'wood_picker_level',
        'stone_picker_level',
        'tool_picker_level',
    ):
        PlayerProfile.objects.filter(**{f'{field}__gt': 5}).update(**{field: 5})


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0015_playerprofile_resource_pickers'),
    ]

    operations = [
        migrations.RunPython(cap_picker_counts, migrations.RunPython.noop),
    ]
