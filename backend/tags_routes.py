# backend/tags_routes.py
from flask import Blueprint, request, jsonify, current_app
import re
import json
import logging

# Use try-except pattern for imports to handle both Docker and development environments
try:
    from . import db_handler
    from .auth_utils import token_required
    from .db_handler import get_db_connection, release_db_connection
except ImportError:
    import db_handler
    from auth_utils import token_required
    from db_handler import get_db_connection, release_db_connection

# Create the tags blueprint
tags_bp = Blueprint('tags_bp', __name__)

# Set up logging
logger = logging.getLogger(__name__)

# ============================
# Direct Tag Management Routes
# ============================

@tags_bp.route('/tags', methods=['GET'])
@token_required
def get_tags():
    """Get tags based on user role."""
    conn = None
    try:
        user_id = request.user['id']
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Fetch tags created by the currently logged-in user
            cur.execute('SELECT id, name, color, created_at FROM tags WHERE user_id = %s ORDER BY name', (user_id,))
            
            tags = cur.fetchall()
            
            result = []
            for tag in tags:
                result.append({
                    'id': tag[0],
                    'name': tag[1],
                    'color': tag[2],
                    'created_at': tag[3].isoformat() if tag[3] else None
                    # Removed is_admin_tag comment
                })
            
            return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error fetching tags: {e}")
        return jsonify({"error": "Failed to fetch tags"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@tags_bp.route('/tags', methods=['POST'])
@token_required
def create_tag():
    """Create a new tag owned by the requesting user."""
    conn = None
    try:
        user_id = request.user['id'] # Get user ID
        data = request.json
        
        if not data or 'name' not in data:
            return jsonify({"error": "Tag name is required"}), 400
        
        name = data['name'].strip()
        color = data.get('color', '#808080')
        
        if not name:
            return jsonify({"error": "Tag name cannot be empty"}), 400

        # tags.name is varchar(50) — validate up front instead of surfacing a 500
        if len(name) > 50:
            return jsonify({"error": "Tag name must not exceed 50 characters"}), 400

        # Validate color format (should be a hex color)
        if not re.match(r'^#[0-9A-Fa-f]{6}$', color):
            return jsonify({"error": "Invalid color format. Use hex format (e.g., #FF5733)"}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if tag with this name already exists FOR THIS USER
            cur.execute('SELECT id FROM tags WHERE name = %s AND user_id = %s', (name, user_id)) # Added user_id check
            existing_tag = cur.fetchone()
            
            if existing_tag:
                 # Differentiate error message slightly
                return jsonify({"error": f"A tag with this name already exists for your account"}), 409 # Updated error message
            
            # Create new tag, setting user_id
            cur.execute(
                'INSERT INTO tags (name, color, user_id) VALUES (%s, %s, %s) RETURNING id', # Added user_id
                (name, color, user_id) # Pass user_id here
            )
            tag_id = cur.fetchone()[0]
            conn.commit()
            
            return jsonify({
                "id": tag_id,
                "name": name,
                "color": color,
                "message": "Tag created successfully"
            }), 201
    except Exception as e:
        logger.error(f"Error creating tag: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to create tag"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@tags_bp.route('/tags/<int:tag_id>', methods=['PUT'])
@token_required
def update_tag(tag_id):
    """Update an existing tag, ensuring user can only update their own type of tag."""
    user_id = request.user['id']
    data = request.get_json()
    new_name = data.get('name')
    new_color = data.get('color')
    
    if not new_name:
        return jsonify({"error": "Tag name cannot be empty"}), 400

    # tags.name is varchar(50) — validate up front instead of surfacing a 500
    if len(new_name) > 50:
        return jsonify({"error": "Tag name must not exceed 50 characters"}), 400

    # Validate color format (basic check)
    if new_color and not re.match(r'^#[0-9a-fA-F]{6}$', new_color):
        return jsonify({"error": "Invalid color format. Use hex (e.g., #RRGGBB)"}), 400
        
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if tag exists AND belongs to the user
            cur.execute('SELECT id, user_id FROM tags WHERE id = %s', (tag_id,)) # Check user_id
            tag = cur.fetchone()
            if not tag:
                return jsonify({"error": "Tag not found"}), 404
                
            tag_user_id = tag[1]
            if tag_user_id != user_id:
                # Prevent user from updating tag they don't own
                return jsonify({"error": "Permission denied to update this tag"}), 403
                
            # Check if new name conflicts with another tag FOR THIS USER
            cur.execute('SELECT id FROM tags WHERE name = %s AND id != %s AND user_id = %s', 
                        (new_name, tag_id, user_id)) # Added user_id check
            existing = cur.fetchone()
            if existing:
                # tag_type = "admin" if is_admin_updater else "user" # Removed
                return jsonify({"error": f"Another tag with this name already exists for your account"}), 409 # Updated error message
                
            # Update the tag
            cur.execute('UPDATE tags SET name = %s, color = %s, updated_at = NOW() WHERE id = %s RETURNING id, name, color', \
                        (new_name, new_color, tag_id))
            updated_tag = cur.fetchone()
        # conn.commit() and return statement are part of the try block, outside the 'with' block.
        conn.commit()
        return jsonify({"id": updated_tag[0], "name": updated_tag[1], "color": updated_tag[2]}), 200
            
    except Exception as e:
        logger.error(f"Error updating tag {tag_id}: {e}")
        if conn:
            conn.rollback() 
        return jsonify({"error": "Failed to update tag"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@tags_bp.route('/tags/<int:tag_id>', methods=['DELETE'])
@token_required 
def delete_tag_endpoint(tag_id):
    """Delete a tag owned by the requesting user and its associations."""
    user_id = request.user['id'] # Get user ID
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if tag exists AND belongs to the user
            cur.execute('SELECT id, user_id FROM tags WHERE id = %s', (tag_id,)) # Check user_id
            tag = cur.fetchone()
            if not tag:
                return jsonify({"error": "Tag not found"}), 404
            
            tag_user_id = tag[1]
            # Only allow deletion if the user owns the tag
            if tag_user_id != user_id:
                 # Prevent users from deleting tags they don't own
                return jsonify({"error": "Permission denied to delete this tag"}), 403

            # Delete associations from warranty_tags first
            cur.execute('DELETE FROM warranty_tags WHERE tag_id = %s', (tag_id,))
            
            # Delete the tag itself
            cur.execute('DELETE FROM tags WHERE id = %s', (tag_id,))
            
            conn.commit()
            
            return jsonify({"message": "Tag deleted successfully"}), 200
            
    except Exception as e:
        logger.error(f"Error deleting tag {tag_id}: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to delete tag"}), 500
    finally:
        if conn:
            release_db_connection(conn)

# ===============================
# Warranty-Tag Association Routes
# ===============================

@tags_bp.route('/warranties/<int:warranty_id>/tags', methods=['GET'])
@token_required
def get_warranty_tags(warranty_id):
    # """Get tags associated with a specific warranty, filtered by user role.""" # Docstring update needed
    """Get tags associated with a specific warranty."""
    conn = None
    try:
        user_id = request.user['id']
        # is_admin = request.user.get('is_admin', False) # Removed
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # First check if the warranty exists and user has access to it
            # Simplified check: just check if warranty exists and belongs to the user
            cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', 
                      (warranty_id, user_id))
            
            if cur.fetchone() is None:
                # Add admin check here if admins should be able to see tags for any warranty
                is_admin = request.user.get('is_admin', False)
                if is_admin:
                    cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
                    if cur.fetchone() is None:
                        return jsonify({"error": "Warranty not found"}), 404
                else:
                     return jsonify({"error": "Warranty not found or you don't have permission to access it"}), 404
            
            # Get tags for this warranty (show all associated tags)
            cur.execute('''
                SELECT t.id, t.name, t.color, t.created_at
                FROM tags t
                JOIN warranty_tags wt ON t.id = wt.tag_id
                WHERE wt.warranty_id = %s -- Removed user_id/is_admin filter
                ORDER BY t.name
            ''', (warranty_id,))
            
            tags = cur.fetchall()
            
            result = []
            for tag in tags:
                result.append({
                    'id': tag[0],
                    'name': tag[1],
                    'color': tag[2],
                    'created_at': tag[3].isoformat() if tag[3] else None
                })
            
            return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error fetching tags for warranty {warranty_id}: {e}")
        return jsonify({"error": "Failed to fetch tags for this warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@tags_bp.route('/warranties/<int:warranty_id>/tags', methods=['POST'])
@token_required
def add_tags_to_warranty(warranty_id):
    # """Add tags to a warranty, ensuring tags match user role.""" # Docstring update needed
    """Add tags owned by the user to a warranty they own."""
    conn = None
    try:
        user_id = request.user['id']
        # is_admin = request.user.get('is_admin', False) # Removed
        
        data = request.json
        if not data or 'tag_ids' not in data:
            return jsonify({"error": "tag_ids array is required"}), 400
        
        tag_ids = data['tag_ids']
        if not isinstance(tag_ids, list):
            return jsonify({"error": "tag_ids must be an array of tag IDs"}), 400
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # First check if the warranty exists and user has access to it (owns it)
            cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', 
                      (warranty_id, user_id))
            
            if cur.fetchone() is None:
                 # Add admin check here if admins should modify any warranty tags
                is_admin = request.user.get('is_admin', False)
                if is_admin:
                    cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
                    if cur.fetchone() is None:
                         return jsonify({"error": "Warranty not found"}), 404
                    # Allow admin to proceed even if they don't own it
                else:
                    return jsonify({"error": "Warranty not found or you don't have permission to modify it"}), 404
            
            # Validate tags before removing/adding
            valid_tag_ids = []
            if tag_ids: # Only validate if there are tags to add
                # Check if all provided tag IDs exist AND belong to the user
                placeholders = ', '.join(['%s'] * len(tag_ids))
                # Ensure the tags being added are owned by the user adding them
                sql = f'SELECT id, user_id FROM tags WHERE id IN ({placeholders}) AND user_id = %s' 
                cur.execute(sql, tag_ids + [user_id]) # Check against current user_id
                found_tags = cur.fetchall()
                
                found_tag_map = {tag[0]: tag[1] for tag in found_tags}
                
                for tag_id in tag_ids:
                    if tag_id not in found_tag_map: # This check also implicitly confirms ownership due to the query change
                        conn.rollback() # Ensure transaction consistency
                        return jsonify({"error": f"Tag with ID {tag_id} not found or not owned by you"}), 404
                    # Removed the old is_admin check
                    # if found_tag_map[tag_id] != is_admin: 
                    #     conn.rollback()
                    #     tag_type_required = "admin" if is_admin else "user"
                    #     return jsonify({"error": f"Tag with ID {tag_id} is not a valid {tag_type_required} tag"}), 403
                    valid_tag_ids.append(tag_id) # Keep track of validated tags
            
            # Remove ALL existing tags before adding new ones for simplicity
            # The old logic only removed tags of the same "type", which is no longer relevant
            cur.execute('DELETE FROM warranty_tags WHERE warranty_id = %s', (warranty_id,))
            
            # Add new (validated) tags
            if valid_tag_ids:
                values_placeholder = ', '.join(['(%s, %s)'] * len(valid_tag_ids))
                sql = f'INSERT INTO warranty_tags (warranty_id, tag_id) VALUES {values_placeholder}'
                params = []
                for tag_id in valid_tag_ids:
                    params.extend([warranty_id, tag_id])
                cur.execute(sql, params)
            
            conn.commit()
            return jsonify({"message": "Tags updated successfully"}), 200
    except Exception as e:
        logger.error(f"Error updating tags for warranty {warranty_id}: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to update tags"}), 500
    finally:
        if conn:
            release_db_connection(conn) 