from django.contrib import admin
from .models import PlayerProfile, ResourceNode, PlayerNode

# Register your models here.
admin.site.register(PlayerProfile)
admin.site.register(ResourceNode)
admin.site.register(PlayerNode)