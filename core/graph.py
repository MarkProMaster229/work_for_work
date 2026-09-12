from __future__ import annotations
from collections import deque


def build_graph(edges: list) -> dict:
    """Строит неориентированный граф смежности из списка рёбер."""
    graph: dict = {}
    for a, b, _dist in edges:
        graph.setdefault(a, []).append(b)
        graph.setdefault(b, []).append(a)
    return graph


def bfs(start: str, goals: set, graph: dict) -> list:
    """BFS до ближайшей цели. Возвращает путь [start ... goal] или []."""
    if start in goals:
        return [start]

    queue = deque([start])
    parent = {start: None}

    while queue:
        node = queue.popleft()
        for neighbor in graph.get(node, []):
            if neighbor in parent:
                continue
            parent[neighbor] = node

            if neighbor in goals:
                path = []
                cur = neighbor
                while cur is not None:
                    path.append(cur)
                    cur = parent[cur]
                return path[::-1]

            queue.append(neighbor)

    return []