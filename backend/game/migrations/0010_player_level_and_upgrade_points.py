from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0009_playerprofile_personal_upgrades'),
    ]

    operations = [
        migrations.AddField(
            model_name='playerprofile',
            name='player_level',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='playerprofile',
            name='level_xp',
            field=models.FloatField(default=0.0),
        ),
        migrations.AddField(
            model_name='playerprofile',
            name='upgrade_points',
            field=models.IntegerField(default=0),
        ),
    ]
