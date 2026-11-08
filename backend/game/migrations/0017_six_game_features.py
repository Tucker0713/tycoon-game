from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0016_cap_helpers_at_five'),
    ]

    operations = [
        migrations.AddField('playerprofile', 'prestige_count', models.IntegerField(default=0)),
        migrations.AddField('playerprofile', 'total_clicks', models.PositiveIntegerField(default=0)),
        migrations.AddField('playerprofile', 'total_resources_collected', models.FloatField(default=0.0)),
        migrations.AddField('playerprofile', 'total_resources_sold', models.FloatField(default=0.0)),
        migrations.AddField('playerprofile', 'total_producers_purchased', models.PositiveIntegerField(default=0)),
        migrations.AddField('playerprofile', 'claimed_achievements', models.JSONField(blank=True, default=list)),
        migrations.AddField('playerprofile', 'daily_quest_date', models.DateField(blank=True, null=True)),
        migrations.AddField('playerprofile', 'daily_quest_data', models.JSONField(blank=True, default=list)),
        migrations.AddField('playerprofile', 'active_boost_started_at', models.DateTimeField(blank=True, null=True)),
        migrations.AddField('playerprofile', 'active_boost_until', models.DateTimeField(blank=True, null=True)),
    ]
