from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.login_user, name='login'),
    path('register/', views.register_user, name='register'),
    path('state/', views.game_state_view, name='game_state'),
    path('buy/', views.buy_node_view, name='buy_node'),
    path('collect/', views.collect_view, name='collect'),
    path('sell/', views.sell_view, name='sell'),
    path('gather/', views.gather_view, name='gather'),
    path('upgrade/', views.buy_upgrade_view, name='buy_upgrade'),
    path('helper/', views.buy_helper_view, name='buy_helper'),
    path('helper/speed/', views.upgrade_helper_speed_view, name='upgrade_helper_speed'),
    path('quest/claim/', views.claim_quest_view, name='claim_quest'),
    path('achievement/claim/', views.claim_achievement_view, name='claim_achievement'),
    path('boost/', views.activate_boost_view, name='activate_boost'),
    path('prestige/', views.prestige_view, name='prestige'),
]
