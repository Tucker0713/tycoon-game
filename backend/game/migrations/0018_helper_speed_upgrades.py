from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0017_six_game_features'),
    ]

    operations = [
        migrations.AddField('playerprofile', 'apple_picker_speed_level', models.IntegerField(default=0)),
        migrations.AddField('playerprofile', 'wood_picker_speed_level', models.IntegerField(default=0)),
        migrations.AddField('playerprofile', 'stone_picker_speed_level', models.IntegerField(default=0)),
        migrations.AddField('playerprofile', 'tool_picker_speed_level', models.IntegerField(default=0)),
    ]
