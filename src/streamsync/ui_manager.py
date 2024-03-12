from json import dumps as json_dumps
from typing import Optional, Union

from streamsync.core import base_component_tree
from streamsync.core_ui import (Component, SessionComponentTree, UIError,
                                current_parent_container)


class StreamsyncUI:
    """Provides mechanisms to manage and manipulate UI components within a
    Streamsync session.

    This class offers context managers and methods to dynamically create, find,
    and organize UI components based on a structured component tree.
    """

    def __init__(self, component_tree: Union[SessionComponentTree, None] = None):
        self.component_tree = component_tree or base_component_tree
        self.root_component = self.component_tree.get_component('root')

    def __enter__(self):
        return self

    def __exit__(self, *args):
        ...

    @staticmethod
    def assert_in_container():
        container = current_parent_container.get(None)
        if container is None:
            raise UIError("A component can only be created inside a container")

    @property
    def root(self) -> Component:
        if not self.root_component:
            raise RuntimeError("Failed to acquire root component")
        return self.root_component

    def find(self, component_id: str) \
            -> Component:
        # Example context manager for finding components
        component = self.component_tree.get_component(component_id)
        if component is None:
            raise RuntimeError(f"Component {component_id} not found")
        return component

    def _prepare_handlers(self, raw_handlers: Optional[dict]):
        handlers = {}
        if raw_handlers is not None:
            for event, handler in raw_handlers.items():
                if callable(handler):
                    handlers[event] = handler.__name__
                else:
                    handlers[event] = handler
        return handlers

    def _prepare_binding(self, raw_binding):
        # TODO
        return raw_binding

    def _prepare_value(self, value):
        if isinstance(value, dict):
            return json_dumps(value)
        return str(value)

    def _create_component(
            self,
            component_type: str,
            **kwargs) -> Component:
        parent_container = current_parent_container.get(None)
        if kwargs.get("id", False) is None:
            kwargs.pop("id")

        if kwargs.get("position", False) is None:
            kwargs.pop("position")

        if kwargs.get("parentId", False) is None:
            kwargs.pop("parentId")

        if "parentId" in kwargs:
            parent_id = kwargs.pop("parentId")
        else:
            parent_id = "root" if not parent_container else parent_container.id

        # Converting all passed content values to strings
        raw_content = kwargs.pop("content", {})
        content = {key: self._prepare_value(value) for key, value in raw_content.items()}

        position: Optional[int] = kwargs.pop("position", None)
        is_positionless: bool = kwargs.pop("positionless", False)
        raw_handlers: dict = kwargs.pop("handlers", {})
        raw_binding: dict = kwargs.pop("binding", {})

        handlers = self._prepare_handlers(raw_handlers) or None
        binding = self._prepare_binding(raw_binding) or None

        component = Component(
            type=component_type,
            parentId=parent_id,
            flag="cmc",
            content=content,
            handlers=handlers,
            binding=binding,
            **kwargs
            )

        # We're determining the position separately
        # due to that we need to know whether ID of the component
        # is present within base component tree
        # or a session-specific one
        component.position = \
            position if position is not None else \
            self.component_tree.determine_position(
                component.id,
                parent_id,
                is_positionless=is_positionless
                )

        self.component_tree.attach(component)
        return component

    def create_container_component(self, component_type: str, **kwargs) \
            -> Component:
        container = self._create_component(component_type, **kwargs)
        return container

    def create_component(self, component_type: str, **kwargs) \
            -> Component:
        self.assert_in_container()
        component = self._create_component(component_type, **kwargs)
        return component