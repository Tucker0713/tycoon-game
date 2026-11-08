from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0008_lumber_camp_production_rate'),
    ]

    operations = [
        migrations.AddField(
            model_name='playerprofile',
            name='spawn_amount_upgrade_level',
            field=models.IntegerField(default=0),
        ),
        migrations.AddField(
            model_name='playerprofile',
            name='node_amount_upgrade_level',
            field=models.IntegerField(default=0),
        ),
    ]
