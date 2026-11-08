from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0014_playerprofile_apple_picker_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='playerprofile',
            name='wood_picker_level',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='playerprofile',
            name='stone_picker_level',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='playerprofile',
            name='tool_picker_level',
            field=models.IntegerField(default=0),
        ),
    ]
