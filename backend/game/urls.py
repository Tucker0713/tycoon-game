from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.login_user, name='login'),
    path('register/', views.register_user, name='register'),
    path('state/', views.game_state_view, name='game_state'),
    path('buy/', views.buy_node_view, name='buy_node'),
    path('gather/', views.gather_view, name='gather'),
]