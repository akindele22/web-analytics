from __future__ import annotations

import dash
import dash_bootstrap_components as dbc
import plotly.express as px
from dash import Input, Output, dcc, html

from app.config import settings
from app.kpi import overview_kpis, product_interaction_cube, top_products_by_likes


def register_dash(flask_server) -> dash.Dash:
    dash_app = dash.Dash(
        __name__,
        server=flask_server,
        url_base_pathname="/dash/",
        external_stylesheets=[dbc.themes.BOOTSTRAP],
        suppress_callback_exceptions=True,
        title="Ecommerce Analytics",
    )

    dash_app.layout = dbc.Container(
        [
            dbc.Row(
                [
                    dbc.Col(html.H2("E-commerce Analytics Dashboard"), md=8),
                    dbc.Col(
                        html.Div(
                            [
                                html.Div("Auto-refresh"),
                                html.Div(f"every {settings.dash_refresh_seconds}s"),
                            ],
                            style={"textAlign": "right", "opacity": 0.7},
                        ),
                        md=4,
                    ),
                ],
                className="mt-3 mb-2",
            ),
            dcc.Interval(
                id="refresh",
                interval=max(2, settings.dash_refresh_seconds) * 1000,
                n_intervals=0,
            ),
            dbc.Row(
                [
                    dbc.Col(dbc.Card([dbc.CardHeader("Total sales"), dbc.CardBody(html.H3(id="kpi_sales"))])),
                    dbc.Col(dbc.Card([dbc.CardHeader("Orders"), dbc.CardBody(html.H3(id="kpi_orders"))])),
                    dbc.Col(dbc.Card([dbc.CardHeader("AOV"), dbc.CardBody(html.H3(id="kpi_aov"))])),
                ],
                className="g-3",
            ),
            dbc.Row(
                [
                    dbc.Col(dbc.Card([dbc.CardHeader("Page views (24h)"), dbc.CardBody(html.H3(id="kpi_views"))])),
                    dbc.Col(dbc.Card([dbc.CardHeader("Likes (24h)"), dbc.CardBody(html.H3(id="kpi_likes"))])),
                    dbc.Col(
                        dbc.Card([dbc.CardHeader("Unique users (24h)"), dbc.CardBody(html.H3(id="kpi_users"))])
                    ),
                ],
                className="g-3 mt-1",
            ),
            dbc.Row(
                [
                    dbc.Col(
                        dbc.Card(
                            [
                                dbc.CardHeader("Top products by likes"),
                                dbc.CardBody(dcc.Graph(id="chart_top_likes", config={"displayModeBar": False})),
                            ]
                        ),
                        md=6,
                        className="mt-3",
                    ),
                    dbc.Col(
                        dbc.Card(
                            [
                                dbc.CardHeader("3D product interaction (views / likes / purchases)"),
                                dbc.CardBody(dcc.Graph(id="chart_3d", config={"displayModeBar": False})),
                            ]
                        ),
                        md=6,
                        className="mt-3",
                    ),
                ],
                className="g-3",
            ),
            dbc.Row(
                [
                    dbc.Col(
                        dbc.Alert(
                            [
                                html.Div("Tip: start sending events to POST /api/events."),
                                html.Div("The dashboard will populate as soon as events arrive."),
                            ],
                            color="info",
                            className="mt-3",
                        )
                    )
                ]
            ),
        ],
        fluid=True,
    )

    @dash_app.callback(
        Output("kpi_sales", "children"),
        Output("kpi_orders", "children"),
        Output("kpi_aov", "children"),
        Output("kpi_views", "children"),
        Output("kpi_likes", "children"),
        Output("kpi_users", "children"),
        Input("refresh", "n_intervals"),
    )
    def refresh_kpis(_n):
        k = overview_kpis()
        return (
            f"£{k.total_sales:,.2f}",
            f"{k.total_orders:,}",
            f"£{k.average_order_value:,.2f}",
            f"{k.page_views_24h:,}",
            f"{k.likes_24h:,}",
            f"{k.unique_users_24h:,}",
        )

    @dash_app.callback(
        Output("chart_top_likes", "figure"),
        Output("chart_3d", "figure"),
        Input("refresh", "n_intervals"),
    )
    def refresh_charts(_n):
        top = top_products_by_likes(limit=10)
        if top.empty:
            fig_top = px.bar(title="No likes yet")
        else:
            fig_top = px.bar(top, x="product_sku", y="likes", title="", text_auto=True)
            fig_top.update_layout(margin=dict(l=10, r=10, t=30, b=10))

        cube = product_interaction_cube(limit=200)
        if cube.empty:
            fig_3d = px.scatter_3d(title="No product interaction yet")
        else:
            fig_3d = px.scatter_3d(
                cube,
                x="views",
                y="likes",
                z="purchases",
                hover_name="product_sku",
                size="likes",
                title="",
            )
            fig_3d.update_layout(margin=dict(l=0, r=0, t=30, b=0))

        return fig_top, fig_3d

    return dash_app
