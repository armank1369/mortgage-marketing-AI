import os
import re
import json
from collections import Counter
from datetime import date
import anthropic
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from flask import Flask, jsonify, request, g
from flask_cors import CORS
from db import get_db_cursor  
from werkzeug.exceptions import HTTPException
from auth_utils import get_authenticated_user, require_auth
from auth.workspace_context import require_workspace, list_user_workspaces
from auth.permissions import require_capability, check_capability
from validation import json_object, required_text, uuid_string
from repositories import (
    get_brand_profile,
    update_brand_profile,
    list_personas,
    list_chat_sessions,
    get_chat_session_messages,
    create_chat_session_with_message,
)
from errors import AppError, NotFoundError, ValidationError, LegacyEndpointRetiredError, PermissionDeniedError
from repositories.persona_repository import create_persona, update_persona
from services.generation_context import resolve_generation_context
from services.configuration import validate_brand_patch, validate_persona_patch, brand_response, persona_response
from services.prompt_builder import build_prompt, render_policy, build_footer

app = Flask(__name__)
CORS(app)

from services.chat_http import blueprint as durable_chat_blueprint, list_v2, detail_v2, body as chat_body
app.register_blueprint(durable_chat_blueprint)


@app.after_request
def private_chat_cache_control(response):
    if request.path == '/api/chat/sessions' or request.path.startswith('/api/chat/sessions/'):
        response.headers['Cache-Control'] = 'no-store'
    return response

# Return stable machine-readable codes and safe human-readable messages.
@app.errorhandler(AppError)
def handle_app_error(err):
    body, status = err.to_response()
    return jsonify(body), status

@app.errorhandler(Exception)
def handle_unexpected_error(error):
    if isinstance(error, HTTPException):
        return jsonify({"error": error.name.lower().replace(" ", "_"), "message": error.description}), error.code
    app.logger.error("Request failed: %s", type(error).__name__)
    return jsonify({"error": "internal_server_error", "message": "The request could not be completed."}), 500

def can_write_configuration():
    try:
        check_capability(g.workspace_context, "config:write")
        return True
    except PermissionDeniedError:
        return False


@app.route('/api/brand-profile', methods=['GET'])
@require_workspace
@require_capability("workspace:read")
def api_get_brand_profile():
    return jsonify(brand_response(get_brand_profile(g.workspace_id), g.workspace_id,
                                  can_write_configuration()))


@app.route('/api/brand-profile', methods=['PUT'])
@require_workspace
@require_capability("config:write")
def api_update_brand_profile():
    fields = validate_brand_patch(json_object())
    updated = update_brand_profile(g.workspace_id, **fields)
    if updated is None:
        raise NotFoundError("No brand profile exists for this workspace. Contact your workspace administrator.")
    return jsonify(brand_response(updated, g.workspace_id, True))


@app.route('/api/personas', methods=['GET'])
@require_workspace
@require_capability("workspace:read")
def api_list_personas():
    return jsonify({"personas": [persona_response(row) for row in list_personas(g.workspace_id)
                                  if str(row.get("workspace_id")) == str(g.workspace_id)
                                  and row.get("deleted_at") is None],
                    "can_write": can_write_configuration()})


@app.route('/api/personas', methods=['POST'])
@require_workspace
@require_capability("config:write")
def api_create_persona():
    fields = validate_persona_patch(json_object(), creating=True)
    row = create_persona(g.workspace_id, **fields)
    if not row:
        raise NotFoundError("The persona could not be created.")
    return jsonify(persona_response(row)), 201


@app.route('/api/personas/<persona_id>', methods=['PUT'])
@require_workspace
@require_capability("config:write")
def api_update_persona(persona_id):
    persona_id = uuid_string(persona_id, "persona_id")
    fields = validate_persona_patch(json_object())
    row = update_persona(g.workspace_id, persona_id, **fields)
    if not row:
        raise NotFoundError("The selected persona is unavailable in this workspace.")
    return jsonify(persona_response(row))


@app.route("/api/workspaces", methods=["GET"])
@require_auth
def api_workspaces():
    # Authenticated accounts with zero memberships get an empty list, not 403.
    memberships = list_user_workspaces(g.auth_user_id)
    return jsonify({"workspaces": [
        {key: row[key] for key in ("workspace_id", "workspace_name", "role", "environment")}
        for row in memberships
    ]})


@app.route("/api/chat/sessions", methods=["GET"])
@require_workspace
@require_capability("chat:read")
def api_list_chat_sessions():
    if request.args.get('version') == '2':
        return list_v2()
    if 'version' in request.args:
        raise ValidationError('Unsupported chat API version.')
    sessions = list_chat_sessions(g.workspace_id, g.workspace_context["workspace_member_id"])
    return jsonify(sessions), 200


@app.route("/api/chat/sessions", methods=["POST"])
@require_workspace
@require_capability("chat:create")
def api_create_chat_session():
    data = chat_body()
    title = required_text(data, "title")
    initial_content = required_text(data, "content")

    session = create_chat_session_with_message(
        workspace_id=g.workspace_id,
        title=title,
        initial_content=initial_content,
        persona_id=data.get("persona_id"),
        author_member_id=g.workspace_context["workspace_member_id"]
    )
    return jsonify(session), 201


@app.route("/api/chat/sessions/<session_id>", methods=["GET"])
@require_workspace
@require_capability("chat:read")
def api_get_chat_session(session_id):
    if request.args.get('version') == '2':
        return detail_v2(session_id)
    if 'version' in request.args:
        raise ValidationError('Unsupported chat API version.')
    session = get_chat_session_messages(g.workspace_id, uuid_string(session_id, "session_id"), g.workspace_context["workspace_member_id"])
    if not session:
        raise NotFoundError("Chat session not found in this workspace.")
    return jsonify(session), 200

ANTHROPIC_MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-haiku-4-5')
anthropic_client = None


def get_anthropic_client():
    global anthropic_client
    if anthropic_client is None:
        anthropic_client = anthropic.Anthropic(max_retries=0, timeout=120.0)
    return anthropic_client




def log_usage(label, result):
    # Prints real cache/token counts from the API's own usage object (Render captures stdout
    # in its log stream) so cache-hit-rate and cost assumptions can be checked against fact
    # instead of estimated — see the char-count-based estimates in the token audit, which are
    # only approximate and were wrong once already about which model/limits actually apply.
    u = result.usage
    cache_write = getattr(u, 'cache_creation_input_tokens', None) or 0
    cache_read = getattr(u, 'cache_read_input_tokens', None) or 0
    print(
        f'[usage] {label} input={u.input_tokens} cache_write={cache_write} '
        f'cache_read={cache_read} output={u.output_tokens}'
    )


from services.generation_policy import (
    build_system,
    BASE_PROMPT,
    COMPLIANCE_PROMPT,
    PLATFORM_PROMPT,
    NO_MARKDOWN_PROMPT,
    CAMPAIGN_INTENT_PATTERN,
    AMBIGUOUS_SCOPE_PATTERN,
    CAMPAIGN_FORMAT_PROMPT,
    VIDEO_BRIEF_FORMAT_PROMPT,
    NON_CAMPAIGN_FORMAT_PROMPT,
    AMBIGUOUS_SCOPE_PROMPT,
    SOCIAL_IMAGE_PROMPT,
    CAMPAIGN_CLARIFICATION_PROMPT,
    CAMPAIGN_JSON_SCHEMA,
    VIDEO_BRIEF_JSON_SCHEMA,
    FLAGGED_STEERING_PHRASES,
    FORBIDDEN_WORDS,
    RESTRICTED_PRICING_OFFER_PHRASES,
    RESTRICTED_PRICING_FALLBACK,
    has_restricted_pricing_offer,
    _normalize,
    _MARKDOWN_BOLD_RE,
    _MARKDOWN_ITALIC_RE,
    _MARKDOWN_HEADER_RE,
    _MARKDOWN_HR_RE,
    _MARKDOWN_CODE_RE,
    _MARKDOWN_INLINE_CODE_RE,
    _MARKDOWN_LINK_RE,
    strip_markdown,
    strip_markdown_deep,
    _INLINE_COMPLIANCE_NOTE,
    _separate_compliance_notes,
    _copy_review_flags,
    _finish_disclosure,
    enforce_compliance,
    enforce_video_brief_compliance,
    RECENT_IDEA_ROWS,
    RECENT_IDEA_MAX_LINES,
    RECENT_IDEA_LINE_CHARS,
    _FILLER_LINE_PATTERN,
    _CONCEPT_LABEL_PATTERN,
    _clean_idea_text,
    _pick_idea_line,
    _extract_json_object,
    _parse_clarification,
    _strip_stray_empty_posts_envelope,
    _parse_posts,
    enforce_posts_compliance,
    SOCIAL_IMAGE_TEMPLATE_SLOTS,
    _parse_social_image,
    _extract_idea_lines,
    _campaign_post_count_shortfalls,
    enforce_campaign_compliance,
    enforce_social_image_compliance,
)

@app.route('/api/hello')
def hello():
    return jsonify({'message': 'Flask backend is running!'})


@app.route('/api/auth/me')
@require_auth
def auth_me():
    return jsonify({'user': get_authenticated_user()})


@app.route('/api/preferences', methods=['GET'])
@require_workspace
@require_capability("workspace:read")
def get_preferences():
    raise LegacyEndpointRetiredError()


@app.route('/api/preferences', methods=['POST'])
@require_workspace
@require_capability("workspace:read")
def save_preferences():
    raise LegacyEndpointRetiredError()


@app.route('/api/history', methods=['GET'])
@require_workspace
@require_capability("workspace:read")
def get_history():
    raise LegacyEndpointRetiredError()


def _invoke_stateless(label, **kwargs):
    result = get_anthropic_client().messages.create(**kwargs)
    log_usage(label, result)
    return result


from services.generation_operations import GenerationRuntime
app.extensions['generation_runtime'] = GenerationRuntime(
    create=lambda **kwargs: get_anthropic_client().messages.create(**kwargs), model=ANTHROPIC_MODEL)


def _stateless_response(generate, data, context):
    from services.generation import InvalidGenerationOutputError
    try:
        return jsonify(generate(data, context, _invoke_stateless, model=ANTHROPIC_MODEL))
    except InvalidGenerationOutputError as error:
        return jsonify({'error': error.legacy_message}), 502
    except anthropic.AuthenticationError:
        return jsonify({'error': 'ai_provider_unavailable', 'message': 'The AI provider is unavailable. Contact your administrator.'}), 502
    except anthropic.RateLimitError:
        return jsonify({'error': 'Anthropic rate limit exceeded. Please wait and try again.'}), 429
    except anthropic.APIConnectionError:
        return jsonify({'error': 'Could not connect to the Anthropic API.'}), 503
    except anthropic.APIStatusError as error:
        app.logger.warning('AI provider request failed: %s', type(error).__name__)
        return jsonify({'error': 'AI provider request failed. Please try again.'}), 502


@app.route('/api/social-image', methods=['POST'])
@require_workspace
@require_capability("ai:generate")
def social_image():
    from services.generation import generate_image
    data = json_object()
    title = data.get('title', '')
    if not isinstance(title, str):
        raise ValidationError('title must be text.')
    script = data.get('script') or {}
    if not isinstance(script, dict):
        raise ValidationError('script must be an object.')
    context = resolve_generation_context(g.workspace_id, persona_id=data.get('persona_id'))
    if not (title or script.get('hook') or script.get('body') or script.get('cta')):
        return jsonify({'error': 'title or script is required'}), 400
    return _stateless_response(generate_image, data, context)


@app.route('/api/video-brief', methods=['POST'])
@require_workspace
@require_capability("ai:generate")
def video_brief():
    from services.generation import generate_video
    data = json_object()
    data['caption'] = required_text(data, 'caption')
    context = resolve_generation_context(g.workspace_id, persona_id=data.get('persona_id'))
    return _stateless_response(generate_video, data, context)


@app.route('/api/chat', methods=['POST'])
@require_workspace
@require_capability("ai:generate")
def chat():
    from services.generation import generate_chat
    data = json_object()
    message = required_text(data, 'message')
    context = resolve_generation_context(g.workspace_id, persona_id=data.get('persona_id'))
    return _stateless_response(generate_chat, message, context)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
