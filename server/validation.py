"""Small request validators shared by protected routes and repositories."""
from uuid import UUID

from flask import request

from errors import ValidationError


def uuid_string(value, field="id"):
    try:
        if not isinstance(value, str):
            raise ValueError()
        return str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError(f"{field} must be a valid UUID.") from None


def json_object():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValidationError("A JSON object is required.")
    return value


def required_text(data, key):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{key} must be non-empty text.")
    return value.strip()
