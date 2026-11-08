from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0013_allow_multiple_resource_copies'),
    ]

    operations = [
        migrations.AddField(
            model_name='playerprofile',
            name='apple_picker_level',
            field=models.IntegerField(default=0),
        ),
    ]
