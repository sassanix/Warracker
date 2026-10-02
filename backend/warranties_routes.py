# backend/warranties_routes.py
from flask import Blueprint, request, jsonify, current_app, send_from_directory
from werkzeug.utils import secure_filename
from datetime import datetime, date
from decimal import Decimal
import os
import json
import csv
import io
from dateutil.relativedelta import relativedelta
from dateutil.parser import parse as date_parse
import mimetypes
from flask import Response

# Add pytz import for timezone functionality
import pytz

# Use relative imports for project modules
try:
    from .db_handler import get_db_connection, release_db_connection
    from .auth_utils import token_required, admin_required
    from .paperless_handler import get_paperless_handler
    from .utils import allowed_file
except ImportError:
    # Fallback for development environment
    from db_handler import get_db_connection, release_db_connection
    from auth_utils import token_required, admin_required
    from paperless_handler import get_paperless_handler
    from utils import allowed_file

import logging
logger = logging.getLogger(__name__)

warranties_bp = Blueprint('warranties_bp', __name__)



def convert_decimals(obj):
    """Recursively convert Decimal objects to float in dicts/lists for JSON serialization."""
    if isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(i) for i in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

@warranties_bp.route('/warranties', methods=['GET'])
@token_required
def get_warranties():
    conn = None
    try:
        user_id = request.user['id']
        # is_admin = request.user.get('is_admin', False) # Removed admin check

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Always fetch warranties belonging to the logged-in user
            # Removed the if is_admin: block
            # Replaced warranty_years with warranty_duration_years, warranty_duration_months, warranty_duration_days
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, w.product_url, w.notes,
                    w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, w.vendor, w.warranty_type,
                    w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number,
                    CASE
                        WHEN COUNT(c.id) = 0 THEN 'NO_CLAIMS'
                        WHEN BOOL_OR(c.status IN ('Submitted', 'In Progress')) THEN 'OPEN'
                        ELSE 'FINISHED'
                    END AS claim_status_summary
                FROM warranties w
                LEFT JOIN warranty_claims c ON w.id = c.warranty_id
                WHERE w.user_id = %s AND w.archived_at IS NULL
                GROUP BY w.id
                ORDER BY CASE WHEN w.is_lifetime THEN 1 ELSE 0 END, w.expiration_date NULLS LAST, w.product_name
            ''', (user_id,))
                
            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []
            
            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)
                
                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers
                
                # Get tags for this warranty (show all associated tags the user can see via warranty access)
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s -- Removed user_id/is_admin filter here
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags
                
                warranties_list.append(warranty_dict)
                
            return jsonify(warranties_list)
    except Exception as e:
        current_app.logger.error(f"Error retrieving warranties: {e}")
        return jsonify({"error": "Failed to retrieve warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/archived', methods=['GET'])
@token_required
def get_archived_warranties():
    conn = None
    try:
        user_id = request.user['id']

        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, w.product_url, w.notes,
                    w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, w.vendor, w.warranty_type,
                    w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number,
                    CASE
                        WHEN COUNT(c.id) = 0 THEN 'NO_CLAIMS'
                        WHEN BOOL_OR(c.status IN ('Submitted', 'In Progress')) THEN 'OPEN'
                        ELSE 'FINISHED'
                    END AS claim_status_summary
                FROM warranties w
                LEFT JOIN warranty_claims c ON w.id = c.warranty_id
                WHERE w.user_id = %s AND w.archived_at IS NOT NULL
                GROUP BY w.id
                ORDER BY w.archived_at DESC NULLS LAST, w.updated_at DESC NULLS LAST, w.product_name
            ''', (user_id,))

            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []

            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)

                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers

                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags

                warranties_list.append(warranty_dict)

            return jsonify(warranties_list)
    except Exception as e:
        current_app.logger.error(f"Error retrieving archived warranties: {e}")
        return jsonify({"error": "Failed to retrieve archived warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties', methods=['POST'])
@token_required
def add_warranty():
    conn = None
    try:
        # Validate input data
        if not request.form.get('product_name'):
            return jsonify({"error": "Product name is required"}), 400

        if len(request.form.get('product_name')) > 255:
            return jsonify({"error": "Product name must be 255 characters or less"}), 400
            
        if not request.form.get('purchase_date'):
            return jsonify({"error": "Purchase date is required"}), 400

        # Handle lifetime warranty
        is_lifetime = request.form.get('is_lifetime', 'false').lower() == 'true'
        expiration_date = None
        warranty_duration_years = 0
        warranty_duration_months = 0
        warranty_duration_days = 0

        if not is_lifetime:
            # Check if exact expiration date is provided
            exact_expiration_date = request.form.get('exact_expiration_date')
            
            if exact_expiration_date:
                # Use exact expiration date provided by user
                try:
                    expiration_date = datetime.strptime(exact_expiration_date, '%Y-%m-%d').date()
                    logger.info(f"Using exact expiration date: {expiration_date}")
                    # Set duration fields to 0 when using exact date
                    warranty_duration_years = 0
                    warranty_duration_months = 0
                    warranty_duration_days = 0
                except ValueError:
                    return jsonify({"error": "Invalid exact expiration date format. Use YYYY-MM-DD"}), 400
            else:
                # Use duration-based calculation (existing logic)
                try:
                    # Handle empty strings explicitly, default to 0
                    years_str = request.form.get('warranty_duration_years', '0')
                    months_str = request.form.get('warranty_duration_months', '0')
                    days_str = request.form.get('warranty_duration_days', '0')
                    
                    warranty_duration_years = int(years_str) if years_str else 0
                    warranty_duration_months = int(months_str) if months_str else 0
                    warranty_duration_days = int(days_str) if days_str else 0

                    if warranty_duration_years < 0 or warranty_duration_months < 0 or warranty_duration_days < 0:
                        return jsonify({"error": "Warranty duration components cannot be negative."}), 400
                    if warranty_duration_years == 0 and warranty_duration_months == 0 and warranty_duration_days == 0:
                        return jsonify({"error": "Warranty duration must be specified for non-lifetime warranties."}), 400
                    if warranty_duration_years > 999:
                         return jsonify({"error": "Warranty years must be 999 or less"}), 400

                except ValueError:
                    return jsonify({"error": "Warranty duration components must be valid numbers."}), 400
        
        # Process the data
        product_name = request.form['product_name']
        purchase_date_str = request.form['purchase_date']
        serial_numbers = request.form.getlist('serial_numbers[]')
        product_url = request.form.get('product_url', '')
        user_id = request.user['id']
        notes = request.form.get('notes', '')
        vendor = request.form.get('vendor', None)
        warranty_type = request.form.get('warranty_type', None)
        model_number = request.form.get('model_number', None)
        
        # Get URL fields for documents
        invoice_url = request.form.get('invoice_url', None)
        manual_url = request.form.get('manual_url', None)
        other_document_url = request.form.get('other_document_url', None)
        
        # Get tag IDs if provided
        tag_ids = []
        if request.form.get('tag_ids'):
            try:
                tag_ids = json.loads(request.form.get('tag_ids'))
                if not isinstance(tag_ids, list):
                    return jsonify({"error": "tag_ids must be a JSON array"}), 400
            except json.JSONDecodeError:
                return jsonify({"error": "tag_ids must be a valid JSON array"}), 400
        
        # Handle purchase price (optional)
        purchase_price = None
        if request.form.get('purchase_price'):
            try:
                purchase_price = float(request.form.get('purchase_price'))
                if purchase_price < 0:
                    return jsonify({"error": "Purchase price cannot be negative"}), 400
            except ValueError:
                return jsonify({"error": "Purchase price must be a valid number"}), 400
        
        # Handle currency (optional, defaults to USD)
        currency = request.form.get('currency', 'USD')
        # Validate currency code
        valid_currencies = [
            'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'KRW', 'CHF', 'CAD', 'AUD',
            'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'RUB',
            'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'VES', 'ZAR', 'EGP', 'NGN',
            'KES', 'GHS', 'MAD', 'TND', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR',
            'JOD', 'LBP', 'ILS', 'TRY', 'IRR', 'PKR', 'BDT', 'LKR', 'NPR', 'BTN',
            'MMK', 'THB', 'VND', 'LAK', 'KHR', 'MYR', 'SGD', 'IDR', 'PHP', 'TWD',
            'HKD', 'MOP', 'KPW', 'MNT', 'KZT', 'UZS', 'TJS', 'KGS', 'TMT', 'AFN',
            'AMD', 'AZN', 'GEL', 'MDL', 'UAH', 'BYN', 'RSD', 'MKD', 'ALL', 'BAM',
            'ISK', 'FJD', 'PGK', 'SBD', 'TOP', 'VUV', 'WST', 'XPF', 'NZD'
        ]
        if currency not in valid_currencies:
            return jsonify({"error": f"Invalid currency code: {currency}"}), 400
        
        try:
            purchase_date = datetime.strptime(purchase_date_str, '%Y-%m-%d').date()
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
            
        # Calculate expiration date only if not lifetime
        if not is_lifetime:
            # Check if exact expiration date is provided
            exact_expiration_date = request.form.get('exact_expiration_date')
            
            if exact_expiration_date:
                # Use exact expiration date provided by user
                try:
                    expiration_date = datetime.strptime(exact_expiration_date, '%Y-%m-%d').date()
                    logger.info(f"Using exact expiration date: {expiration_date}")
                except ValueError:
                    return jsonify({"error": "Invalid exact expiration date format. Use YYYY-MM-DD"}), 400
            elif warranty_duration_years > 0 or warranty_duration_months > 0 or warranty_duration_days > 0:
                # Use duration-based calculation
                try:
                    expiration_date = purchase_date + relativedelta(
                        years=warranty_duration_years,
                        months=warranty_duration_months,
                        days=warranty_duration_days
                    )
                    logger.info(f"Calculated expiration date: {expiration_date} from years={warranty_duration_years}, months={warranty_duration_months}, days={warranty_duration_days}")
                except Exception as calc_err:
                    logger.error(f"Error calculating expiration date: {calc_err}")
                    return jsonify({"error": "Failed to calculate expiration date from duration components"}), 500
            else:
                # Neither exact date nor duration provided
                return jsonify({"error": "Either exact expiration date or warranty duration must be specified for non-lifetime warranties."}), 400

        # Expiration date cannot precede the purchase date
        if expiration_date is not None and expiration_date < purchase_date:
            return jsonify({"error": "Expiration date cannot be before purchase date"}), 400

        # Handle Paperless-ngx document IDs if provided (check before file uploads)
        paperless_invoice_id = request.form.get('paperless_invoice_id')
        paperless_manual_id = request.form.get('paperless_manual_id')
        paperless_photo_id = request.form.get('paperless_photo_id')
        paperless_other_id = request.form.get('paperless_other_id')
        
        # Convert empty strings to None for database insertion
        paperless_invoice_id = int(paperless_invoice_id) if paperless_invoice_id and paperless_invoice_id.strip() else None
        paperless_manual_id = int(paperless_manual_id) if paperless_manual_id and paperless_manual_id.strip() else None
        paperless_photo_id = int(paperless_photo_id) if paperless_photo_id and paperless_photo_id.strip() else None
        paperless_other_id = int(paperless_other_id) if paperless_other_id and paperless_other_id.strip() else None

        # Handle invoice file upload (only if not stored in Paperless-ngx)
        db_invoice_path = None
        if not paperless_invoice_id and 'invoice' in request.files:
            invoice = request.files['invoice']
            if invoice.filename != '':
                if not allowed_file(invoice.filename):
                    return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
                    
                filename = secure_filename(invoice.filename)
                filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
                invoice_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                
                logger.info(f"Attempting to save invoice to: {invoice_path}")
                try:
                    invoice.save(invoice_path)
                    db_invoice_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved invoice: {db_invoice_path}")
                except Exception as e:
                    logger.error(f"Error saving invoice {filename} to {invoice_path}: {e}")
                    # Optionally, decide if you want to return an error here or continue
                    return jsonify({"error": f"Failed to save invoice: {str(e)}"}), 500
        elif paperless_invoice_id:
            logger.info(f"Invoice stored in Paperless-ngx with ID: {paperless_invoice_id}")
        
        # Handle manual file upload (only if not stored in Paperless-ngx)
        db_manual_path = None
        if not paperless_manual_id and 'manual' in request.files:
            manual = request.files['manual']
            if manual.filename != '':
                if not allowed_file(manual.filename):
                    return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
                    
                filename = secure_filename(manual.filename)
                filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_manual_{filename}"
                manual_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                logger.info(f"Attempting to save manual to: {manual_path}")
                try:
                    manual.save(manual_path)
                    db_manual_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved manual: {db_manual_path}")
                except Exception as e:
                    logger.error(f"Error saving manual {filename} to {manual_path}: {e}")
                    return jsonify({"error": f"Failed to save manual: {str(e)}"}), 500
        elif paperless_manual_id:
            logger.info(f"Manual stored in Paperless-ngx with ID: {paperless_manual_id}")
        
        # Handle other_document file upload (only if not stored in Paperless-ngx)
        db_other_document_path = None
        if not paperless_other_id and 'other_document' in request.files:
            other_document = request.files['other_document']
            if other_document.filename != '':
                if not allowed_file(other_document.filename):
                    return jsonify({"error": "File type not allowed for other document. Use PDF, PNG, JPG, JPEG, ZIP, or RAR"}), 400
                    
                filename = secure_filename(other_document.filename)
                filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_other_{filename}"
                other_document_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                logger.info(f"Attempting to save other_document to: {other_document_path_on_disk}")
                try:
                    other_document.save(other_document_path_on_disk)
                    db_other_document_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved other_document: {db_other_document_path}")
                except Exception as e:
                    logger.error(f"Error saving other_document {filename} to {other_document_path_on_disk}: {e}")
                    return jsonify({"error": f"Failed to save other_document: {str(e)}"}), 500
        elif paperless_other_id:
            logger.info(f"Other document stored in Paperless-ngx with ID: {paperless_other_id}")

        # Handle product photo file upload (only if not stored in Paperless-ngx)
        db_product_photo_path = None
        if not paperless_photo_id and 'product_photo' in request.files:
            product_photo = request.files['product_photo']
            if product_photo.filename != '':
                # Check if it's an image file
                if not (product_photo.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif'))):
                    return jsonify({"error": "Product photo must be an image file (PNG, JPG, JPEG, WEBP, GIF)"}), 400
                    
                filename = secure_filename(product_photo.filename)
                filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_photo_{filename}"
                product_photo_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                logger.info(f"Attempting to save product_photo to: {product_photo_path_on_disk}")
                try:
                    product_photo.save(product_photo_path_on_disk)
                    db_product_photo_path = os.path.join('uploads', filename)
                    logger.info(f"Successfully saved product_photo: {db_product_photo_path}")
                except Exception as e:
                    logger.error(f"Error saving product_photo {filename} to {product_photo_path_on_disk}: {e}")
                    return jsonify({"error": f"Failed to save product_photo: {str(e)}"}), 500
        elif paperless_photo_id:
            logger.info(f"Product photo stored in Paperless-ngx with ID: {paperless_photo_id}")



        # Save to database
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Insert warranty
            cur.execute('''
                INSERT INTO warranties (
                    product_name, purchase_date, expiration_date, 
                    invoice_path, manual_path, other_document_path, product_url, purchase_price, user_id, is_lifetime, notes, vendor, warranty_type,
                    warranty_duration_years, warranty_duration_months, warranty_duration_days, product_photo_path, currency,
                    paperless_invoice_id, paperless_manual_id, paperless_photo_id, paperless_other_id,
                    invoice_url, manual_url, other_document_url, model_number
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            ''', (
                product_name, purchase_date, expiration_date,
                db_invoice_path, db_manual_path, db_other_document_path, product_url, purchase_price, user_id, is_lifetime, notes, vendor, warranty_type,
                warranty_duration_years, warranty_duration_months, warranty_duration_days, db_product_photo_path, currency,
                paperless_invoice_id, paperless_manual_id, paperless_photo_id, paperless_other_id,
                invoice_url, manual_url, other_document_url, model_number
            ))
            warranty_id = cur.fetchone()[0]
            
            # Insert serial numbers
            if serial_numbers:
                for serial_number in serial_numbers:
                    if serial_number.strip():  # Only insert non-empty serial numbers
                        cur.execute('''
                            INSERT INTO serial_numbers (warranty_id, serial_number)
                            VALUES (%s, %s)
                        ''', (warranty_id, serial_number.strip()))
            
            # Insert tags if provided
            if tag_ids:
                for tag_id in tag_ids:
                    # Verify tag exists
                    cur.execute('SELECT id FROM tags WHERE id = %s', (tag_id,))
                    if cur.fetchone():
                        cur.execute('''
                            INSERT INTO warranty_tags (warranty_id, tag_id)
                            VALUES (%s, %s)
                        ''', (warranty_id, tag_id))
                    else:
                        logger.warning(f"Skipping non-existent tag ID: {tag_id}")
            
            conn.commit()
            
        return jsonify({
            'message': 'Warranty added successfully',
            'id': warranty_id
        }), 201
        
    except Exception as e:
        logger.error(f"Error adding warranty: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to add warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/<int:warranty_id>/archive', methods=['PATCH'])
@token_required
def toggle_archive_warranty(warranty_id):
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)

        if not request.is_json:
            return jsonify({"error": "Request must be JSON"}), 400
        archived_flag = request.json.get('archived')
        if archived_flag is None:
            return jsonify({"error": "Missing 'archived' boolean in request body"}), 400

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Ensure warranty exists and belongs to user unless admin
            if is_admin:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Warranty not found or permission denied"}), 404

            if archived_flag is True:
                cur.execute('UPDATE warranties SET archived_at = NOW(), updated_at = NOW() WHERE id = %s', (warranty_id,))
            else:
                cur.execute('UPDATE warranties SET archived_at = NULL, updated_at = NOW() WHERE id = %s', (warranty_id,))

            conn.commit()

        return jsonify({"message": "Archive status updated", "archived": bool(archived_flag)})
    except Exception as e:
        current_app.logger.error(f"Error toggling archive status: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to update archive status"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>', methods=['DELETE'])
@token_required
def delete_warranty(warranty_id):
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user['is_admin']
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if warranty exists and belongs to the user
            if is_admin:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
                
            warranty = cur.fetchone()
            
            if not warranty:
                return jsonify({"error": "Warranty not found or you don't have permission to delete it"}), 404
            
            # First get the file paths to delete the files
            cur.execute('SELECT invoice_path, manual_path, other_document_path, product_photo_path FROM warranties WHERE id = %s', (warranty_id,))
            result = cur.fetchone()
            
            invoice_path = result[0]
            manual_path = result[1]
            other_document_path = result[2]
            product_photo_path = result[3]
            
            # Delete the warranty from database
            cur.execute('DELETE FROM warranties WHERE id = %s', (warranty_id,))
            deleted_rows = cur.rowcount
            conn.commit()
            
            # Delete the invoice file if it exists
            if invoice_path:
                full_path = os.path.join('/data', invoice_path)
                if os.path.exists(full_path):
                    os.remove(full_path)
            
            # Delete the manual file if it exists
            if manual_path:
                full_path = os.path.join('/data', manual_path)
                if os.path.exists(full_path):
                    os.remove(full_path)
            
            # Delete the other_document file if it exists
            if other_document_path:
                full_path = os.path.join('/data', other_document_path)
                if os.path.exists(full_path):
                    os.remove(full_path)
            
            # Delete the product photo file if it exists
            if product_photo_path:
                full_path = os.path.join('/data', product_photo_path)
                if os.path.exists(full_path):
                    os.remove(full_path)

            return jsonify({"message": "Warranty deleted successfully"}), 200
            
    except Exception as e:
        logger.error(f"Error deleting warranty: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to delete warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/<int:warranty_id>', methods=['PUT'])
@token_required
def update_warranty(warranty_id):
    # --- Log function entry ---
    logger.info(f"Entering update_warranty function for ID: {warranty_id}") 
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user['is_admin']
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if warranty exists and belongs to the user
            if is_admin:
                cur.execute('SELECT id FROM warranties WHERE id = %s', (warranty_id,))
            else:
                cur.execute('SELECT id FROM warranties WHERE id = %s AND user_id = %s', (warranty_id, user_id))
            warranty = cur.fetchone()
            if not warranty:
                return jsonify({"error": "Warranty not found or you don't have permission to update it"}), 404

            # --- PATCH: Support JSON-only notes update ---
            if request.is_json and 'notes' in request.json and len(request.json) == 1:
                notes = request.json.get('notes', None)
                cur.execute("UPDATE warranties SET notes = %s, updated_at = NOW() WHERE id = %s", (notes, warranty_id))
                conn.commit()
                return jsonify({"message": "Notes updated successfully"}), 200

            # --- Otherwise, continue with the original (form-based) update logic ---
            # Validate input data similar to the add_warranty route
            if not request.form.get('product_name'):
                return jsonify({"error": "Product name is required"}), 400
            if len(request.form.get('product_name')) > 255:
                return jsonify({"error": "Product name must be 255 characters or less"}), 400
            if not request.form.get('purchase_date'):
                return jsonify({"error": "Purchase date is required"}), 400
            logger.info(f"Received update request for warranty {warranty_id}")
            logger.info(f"Received update request for warranty {warranty_id}")
            is_lifetime = request.form.get('is_lifetime', 'false').lower() == 'true'
            logger.info(f"Parsed is_lifetime as: {is_lifetime}")
            purchase_date_str = request.form['purchase_date']
            try:
                purchase_date = datetime.strptime(purchase_date_str, '%Y-%m-%d').date() # Use .date()
            except ValueError:
                return jsonify({"error": "Invalid date format for purchase date. Use YYYY-MM-DD"}), 400

            expiration_date = None
            warranty_duration_years = 0
            warranty_duration_months = 0
            warranty_duration_days = 0

            if not is_lifetime:
                # Check if exact expiration date is provided
                exact_expiration_date = request.form.get('exact_expiration_date')
                
                if exact_expiration_date:
                    # Use exact expiration date provided by user
                    try:
                        expiration_date = datetime.strptime(exact_expiration_date, '%Y-%m-%d').date()
                        logger.info(f"Using exact expiration date: {expiration_date}")
                        # Set duration fields to 0 when using exact date
                        warranty_duration_years = 0
                        warranty_duration_months = 0
                        warranty_duration_days = 0
                    except ValueError:
                        return jsonify({"error": "Invalid exact expiration date format. Use YYYY-MM-DD"}), 400
                else:
                    # Use duration-based calculation (existing logic)
                    try:
                        # Handle empty strings explicitly, default to 0
                        years_str = request.form.get('warranty_duration_years', '0')
                        months_str = request.form.get('warranty_duration_months', '0')
                        days_str = request.form.get('warranty_duration_days', '0')
                        
                        warranty_duration_years = int(years_str) if years_str else 0
                        warranty_duration_months = int(months_str) if months_str else 0
                        warranty_duration_days = int(days_str) if days_str else 0

                        if warranty_duration_years < 0 or warranty_duration_months < 0 or warranty_duration_days < 0:
                            return jsonify({"error": "Warranty duration components cannot be negative."}), 400
                        if warranty_duration_years == 0 and warranty_duration_months == 0 and warranty_duration_days == 0:
                            return jsonify({"error": "Warranty duration must be specified for non-lifetime warranties."}), 400
                        if warranty_duration_years > 999:
                             return jsonify({"error": "Warranty years must be 999 or less"}), 400

                    except ValueError:
                        return jsonify({"error": "Warranty duration components must be valid numbers."}), 400
                
                # Calculate expiration date based on duration only if exact date wasn't provided
                if not exact_expiration_date:
                    if warranty_duration_years > 0 or warranty_duration_months > 0 or warranty_duration_days > 0:
                        try:
                            expiration_date = purchase_date + relativedelta(
                                years=warranty_duration_years,
                                months=warranty_duration_months,
                                days=warranty_duration_days
                            )
                            logger.info(f"Calculated expiration date: {expiration_date} from years={warranty_duration_years}, months={warranty_duration_months}, days={warranty_duration_days}")
                        except Exception as calc_err:
                            logger.error(f"Error calculating expiration date: {calc_err}")
                            return jsonify({"error": "Failed to calculate expiration date from duration components"}), 500
                    else:
                        return jsonify({"error": "Either exact expiration date or warranty duration must be specified for non-lifetime warranties."}), 400

            # Expiration date cannot precede the purchase date
            if expiration_date is not None and expiration_date < purchase_date:
                return jsonify({"error": "Expiration date cannot be before purchase date"}), 400

            logger.info(f"Calculated values: Y={warranty_duration_years}, M={warranty_duration_months}, D={warranty_duration_days}, expiration_date={expiration_date}")
            product_name = request.form['product_name']
            serial_numbers = request.form.getlist('serial_numbers[]') # Ensure correct parsing for lists
            product_url = request.form.get('product_url', '')
            notes = request.form.get('notes', None)
            vendor = request.form.get('vendor', None)
            warranty_type = request.form.get('warranty_type', None)
            model_number = request.form.get('model_number', None)
            
            # Get URL fields for documents
            invoice_url = request.form.get('invoice_url', None)
            manual_url = request.form.get('manual_url', None)
            other_document_url = request.form.get('other_document_url', None)
            tag_ids = []
            if request.form.get('tag_ids'):
                try:
                    tag_ids = json.loads(request.form.get('tag_ids'))
                    if not isinstance(tag_ids, list):
                        return jsonify({"error": "tag_ids must be a JSON array"}), 400
                except json.JSONDecodeError:
                    return jsonify({"error": "tag_ids must be a valid JSON array"}), 400
            purchase_price = None
            if request.form.get('purchase_price'):
                try:
                    purchase_price = float(request.form.get('purchase_price'))
                    if purchase_price < 0:
                        return jsonify({"error": "Purchase price cannot be negative"}), 400
                except ValueError:
                    return jsonify({"error": "Purchase price must be a valid number"}), 400
            
            # Handle currency (optional, defaults to USD)
            currency = request.form.get('currency', 'USD')
            # Validate currency code
            valid_currencies = [
                'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'INR', 'KRW', 'CHF', 'CAD', 'AUD',
                'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'BGN', 'RON', 'HRK', 'RUB',
                'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'VES', 'ZAR', 'EGP', 'NGN',
                'KES', 'GHS', 'MAD', 'TND', 'AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR',
                'JOD', 'LBP', 'ILS', 'TRY', 'IRR', 'PKR', 'BDT', 'LKR', 'NPR', 'BTN',
                'MMK', 'THB', 'VND', 'LAK', 'KHR', 'MYR', 'SGD', 'IDR', 'PHP', 'TWD',
                'HKD', 'MOP', 'KPW', 'MNT', 'KZT', 'UZS', 'TJS', 'KGS', 'TMT', 'AFN',
                'AMD', 'AZN', 'GEL', 'MDL', 'UAH', 'BYN', 'RSD', 'MKD', 'ALL', 'BAM',
                'ISK', 'FJD', 'PGK', 'SBD', 'TOP', 'VUV', 'WST', 'XPF', 'NZD'
            ]
            if currency not in valid_currencies:
                return jsonify({"error": f"Invalid currency code: {currency}"}), 400

            # Handle Paperless-ngx document IDs
            paperless_invoice_id = request.form.get('paperless_invoice_id')
            paperless_manual_id = request.form.get('paperless_manual_id')
            paperless_photo_id = request.form.get('paperless_photo_id')
            paperless_other_id = request.form.get('paperless_other_id')

            logger.info(f"[UPDATE] Received Paperless IDs: invoice={paperless_invoice_id}, manual={paperless_manual_id}, photo={paperless_photo_id}, other={paperless_other_id}")

            # Convert to integers if provided, otherwise None
            paperless_invoice_id = int(paperless_invoice_id) if paperless_invoice_id and paperless_invoice_id.strip() else None
            paperless_manual_id = int(paperless_manual_id) if paperless_manual_id and paperless_manual_id.strip() else None
            paperless_photo_id = int(paperless_photo_id) if paperless_photo_id and paperless_photo_id.strip() else None
            paperless_other_id = int(paperless_other_id) if paperless_other_id and paperless_other_id.strip() else None

            logger.info(f"[UPDATE] Converted Paperless IDs: invoice={paperless_invoice_id}, manual={paperless_manual_id}, photo={paperless_photo_id}, other={paperless_other_id}")
            
            # File handling for invoice
            db_invoice_path = None
            if not paperless_invoice_id and 'invoice' in request.files:
                invoice = request.files['invoice']
                if invoice.filename != '':
                    if not allowed_file(invoice.filename):
                        return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
                    cur.execute('SELECT invoice_path FROM warranties WHERE id = %s', (warranty_id,))
                    old_invoice_path = cur.fetchone()[0]
                    if old_invoice_path:
                        full_path = os.path.join('/data', old_invoice_path)
                        if os.path.exists(full_path):
                            try:
                                os.remove(full_path)
                                logger.info(f"Deleted old invoice: {full_path}")
                            except Exception as e:
                                logger.error(f"Error deleting old invoice: {e}")
                    filename = secure_filename(invoice.filename)
                    filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
                    invoice_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    logger.info(f"Attempting to save updated invoice to: {invoice_path}")
                    try:
                        invoice.save(invoice_path)
                        db_invoice_path = os.path.join('uploads', filename)
                        logger.info(f"Successfully saved updated invoice: {db_invoice_path}")
                    except Exception as e:
                        logger.error(f"Error saving updated invoice {filename} to {invoice_path}: {e}")
                        return jsonify({"error": f"Failed to save updated invoice: {str(e)}"}), 500
            elif paperless_invoice_id:
                logger.info(f"Invoice updated to Paperless-ngx with ID: {paperless_invoice_id}")
                # Clear local path when storing in Paperless-ngx
                cur.execute('SELECT invoice_path FROM warranties WHERE id = %s', (warranty_id,))
                old_invoice_path = cur.fetchone()[0]
                if old_invoice_path:
                    full_path = os.path.join('/data', old_invoice_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted old local invoice (moving to Paperless): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting old local invoice: {e}")
                db_invoice_path = None  # Clear local path
            elif request.form.get('delete_invoice', 'false').lower() == 'true':
                cur.execute('SELECT invoice_path FROM warranties WHERE id = %s', (warranty_id,))
                old_invoice_path = cur.fetchone()[0]
                if old_invoice_path:
                    full_path = os.path.join('/data', old_invoice_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted invoice (delete request): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting invoice (delete request): {e}")
                db_invoice_path = None  # Set to None to clear in DB
            
            # File handling for manual
            db_manual_path = None
            if not paperless_manual_id and 'manual' in request.files:
                manual = request.files['manual']
                if manual.filename != '':
                    if not allowed_file(manual.filename):
                        return jsonify({"error": "File type not allowed. Use PDF, PNG, JPG, or JPEG"}), 400
                    cur.execute('SELECT manual_path FROM warranties WHERE id = %s', (warranty_id,))
                    old_manual_path = cur.fetchone()[0]
                    if old_manual_path:
                        full_path = os.path.join('/data', old_manual_path)
                        if os.path.exists(full_path):
                            try:
                                os.remove(full_path)
                                logger.info(f"Deleted old manual: {full_path}")
                            except Exception as e:
                                logger.error(f"Error deleting old manual: {e}")
                    filename = secure_filename(manual.filename)
                    filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_manual_{filename}"
                    manual_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    logger.info(f"Attempting to save updated manual to: {manual_path}")
                    try:
                        manual.save(manual_path)
                        db_manual_path = os.path.join('uploads', filename)
                        logger.info(f"Successfully saved updated manual: {db_manual_path}")
                    except Exception as e:
                        logger.error(f"Error saving updated manual {filename} to {manual_path}: {e}")
                        return jsonify({"error": f"Failed to save updated manual: {str(e)}"}), 500
            elif paperless_manual_id:
                logger.info(f"Manual updated to Paperless-ngx with ID: {paperless_manual_id}")
                # Clear local path when storing in Paperless-ngx
                cur.execute('SELECT manual_path FROM warranties WHERE id = %s', (warranty_id,))
                old_manual_path = cur.fetchone()[0]
                if old_manual_path:
                    full_path = os.path.join('/data', old_manual_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted old local manual (moving to Paperless): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting old local manual: {e}")
                db_manual_path = None  # Clear local path
            elif request.form.get('delete_manual', 'false').lower() == 'true':
                cur.execute('SELECT manual_path FROM warranties WHERE id = %s', (warranty_id,))
                old_manual_path = cur.fetchone()[0]
                if old_manual_path:
                    full_path = os.path.join('/data', old_manual_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted manual (delete request): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting manual (delete request): {e}")
                db_manual_path = None  # Set to None to clear in DB
            
            # File handling for other document
            db_other_document_path = None
            if not paperless_other_id and 'other_document' in request.files:
                other_document = request.files['other_document']
                if other_document.filename != '':
                    if not allowed_file(other_document.filename):
                        return jsonify({"error": "File type not allowed for other document. Use PDF, PNG, JPG, JPEG, ZIP, or RAR"}), 400
                    cur.execute('SELECT other_document_path FROM warranties WHERE id = %s', (warranty_id,))
                    old_other_document_path = cur.fetchone()[0]
                    if old_other_document_path:
                        full_path = os.path.join('/data', old_other_document_path)
                        if os.path.exists(full_path):
                            try:
                                os.remove(full_path)
                                logger.info(f"Deleted old other_document: {full_path}")
                            except Exception as e:
                                logger.error(f"Error deleting old other_document: {e}")
                    filename = secure_filename(other_document.filename)
                    filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_other_{filename}"
                    other_document_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    logger.info(f"Attempting to save updated other_document to: {other_document_path_on_disk}")
                    try:
                        other_document.save(other_document_path_on_disk)
                        db_other_document_path = os.path.join('uploads', filename)
                        logger.info(f"Successfully saved updated other_document: {db_other_document_path}")
                    except Exception as e:
                        logger.error(f"Error saving updated other_document {filename} to {other_document_path_on_disk}: {e}")
                        return jsonify({"error": f"Failed to save updated other_document: {str(e)}"}), 500
            elif paperless_other_id:
                logger.info(f"Other document updated to Paperless-ngx with ID: {paperless_other_id}")
                # Clear local path when storing in Paperless-ngx
                cur.execute('SELECT other_document_path FROM warranties WHERE id = %s', (warranty_id,))
                old_other_document_path = cur.fetchone()[0]
                if old_other_document_path:
                    full_path = os.path.join('/data', old_other_document_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted old local other_document (moving to Paperless): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting old local other_document: {e}")
                db_other_document_path = None  # Clear local path
            elif request.form.get('delete_other_document', 'false').lower() == 'true':
                cur.execute('SELECT other_document_path FROM warranties WHERE id = %s', (warranty_id,))
                old_other_document_path = cur.fetchone()[0]
                if old_other_document_path:
                    full_path = os.path.join('/data', old_other_document_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted other_document (delete request): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting other_document (delete request): {e}")
                db_other_document_path = None # Set to None to clear in DB

            # Handle product photo file upload (only if not stored in Paperless-ngx)
            db_product_photo_path = None
            if not paperless_photo_id and 'product_photo' in request.files:
                product_photo = request.files['product_photo']
                if product_photo.filename != '':
                    # Check if it's an image file
                    if not (product_photo.filename.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif'))):
                        return jsonify({"error": "Product photo must be an image file (PNG, JPG, JPEG, WEBP, GIF)"}), 400
                    
                    # Delete old photo if it exists
                    cur.execute('SELECT product_photo_path FROM warranties WHERE id = %s', (warranty_id,))
                    old_product_photo_path = cur.fetchone()[0]
                    if old_product_photo_path:
                        full_path = os.path.join('/data', old_product_photo_path)
                        if os.path.exists(full_path):
                            try:
                                os.remove(full_path)
                                logger.info(f"Deleted old product_photo: {full_path}")
                            except Exception as e:
                                logger.error(f"Error deleting old product_photo: {e}")
                    
                    filename = secure_filename(product_photo.filename)
                    filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_photo_{filename}"
                    product_photo_path_on_disk = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
                    logger.info(f"Attempting to save updated product_photo to: {product_photo_path_on_disk}")
                    try:
                        product_photo.save(product_photo_path_on_disk)
                        db_product_photo_path = os.path.join('uploads', filename)
                        logger.info(f"Successfully saved updated product_photo: {db_product_photo_path}")
                    except Exception as e:
                        logger.error(f"Error saving updated product_photo {filename} to {product_photo_path_on_disk}: {e}")
                        return jsonify({"error": f"Failed to save updated product_photo: {str(e)}"}), 500
            elif paperless_photo_id:
                logger.info(f"Product photo updated to Paperless-ngx with ID: {paperless_photo_id}")
                # Clear local path when storing in Paperless-ngx
                cur.execute('SELECT product_photo_path FROM warranties WHERE id = %s', (warranty_id,))
                old_product_photo_path = cur.fetchone()[0]
                if old_product_photo_path:
                    full_path = os.path.join('/data', old_product_photo_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted old local product_photo (moving to Paperless): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting old local product_photo: {e}")
                db_product_photo_path = None  # Clear local path
            elif request.form.get('delete_product_photo', 'false').lower() == 'true':
                cur.execute('SELECT product_photo_path FROM warranties WHERE id = %s', (warranty_id,))
                old_product_photo_path = cur.fetchone()[0]
                if old_product_photo_path:
                    full_path = os.path.join('/data', old_product_photo_path)
                    if os.path.exists(full_path):
                        try:
                            os.remove(full_path)
                            logger.info(f"Deleted product_photo (delete request): {full_path}")
                        except Exception as e:
                            logger.error(f"Error deleting product_photo (delete request): {e}")
                db_product_photo_path = None  # Set to None to clear in DB

            # Prepare update parameters
            update_params = {
                'product_name': product_name,
                'purchase_date': purchase_date,
                'is_lifetime': is_lifetime,
                'warranty_duration_years': warranty_duration_years,
                'warranty_duration_months': warranty_duration_months,
                'warranty_duration_days': warranty_duration_days,
                'expiration_date': expiration_date, # Will be None if lifetime
                'product_url': product_url,
                'purchase_price': purchase_price,
                'vendor': vendor,
                'warranty_type': warranty_type,
                'currency': currency,
                'model_number': model_number
            }
            sql_fields = []
            sql_values = []
            for key, value in update_params.items():
                sql_fields.append(f"{key} = %s")
                sql_values.append(value)
            if notes is not None:
                sql_fields.append("notes = %s")
                sql_values.append(notes)
            if db_invoice_path is not None:
                sql_fields.append("invoice_path = %s")
                sql_values.append(db_invoice_path)
            elif 'delete_invoice' in request.form and request.form.get('delete_invoice', 'false').lower() == 'true':
                sql_fields.append("invoice_path = NULL")
                sql_fields.append("paperless_invoice_id = NULL")  # Also clear Paperless ID
            if db_manual_path is not None:
                sql_fields.append("manual_path = %s")
                sql_values.append(db_manual_path)
            elif 'delete_manual' in request.form and request.form.get('delete_manual', 'false').lower() == 'true':
                sql_fields.append("manual_path = NULL")
                sql_fields.append("paperless_manual_id = NULL")  # Also clear Paperless ID
            if db_other_document_path is not None:
                sql_fields.append("other_document_path = %s")
                sql_values.append(db_other_document_path)
            elif 'delete_other_document' in request.form and request.form.get('delete_other_document', 'false').lower() == 'true':
                sql_fields.append("other_document_path = NULL")
                sql_fields.append("paperless_other_id = NULL")  # Also clear Paperless ID
            if db_product_photo_path is not None:
                sql_fields.append("product_photo_path = %s")
                sql_values.append(db_product_photo_path)
            elif 'delete_product_photo' in request.form and request.form.get('delete_product_photo', 'false').lower() == 'true':
                sql_fields.append("product_photo_path = NULL")
                sql_fields.append("paperless_photo_id = NULL")  # Also clear Paperless ID

            # Handle Paperless-ngx document IDs
            if paperless_invoice_id is not None:
                sql_fields.append("paperless_invoice_id = %s")
                sql_values.append(paperless_invoice_id)
            if paperless_manual_id is not None:
                sql_fields.append("paperless_manual_id = %s")
                sql_values.append(paperless_manual_id)
            if paperless_photo_id is not None:
                sql_fields.append("paperless_photo_id = %s")
                sql_values.append(paperless_photo_id)
            if paperless_other_id is not None:
                sql_fields.append("paperless_other_id = %s")
                sql_values.append(paperless_other_id)

            # Handle URL fields for documents
            if 'invoice_url' in request.form:
                sql_fields.append("invoice_url = %s")
                sql_values.append(request.form.get('invoice_url'))
            if 'manual_url' in request.form:
                sql_fields.append("manual_url = %s")
                sql_values.append(request.form.get('manual_url'))
            if 'other_document_url' in request.form:
                sql_fields.append("other_document_url = %s")
                sql_values.append(request.form.get('other_document_url'))

            sql_fields.append("updated_at = NOW()") # Use SQL function, no parameter needed
            sql_values.append(warranty_id)
            update_sql = f"UPDATE warranties SET {', '.join(sql_fields)} WHERE id = %s"
            cur.execute(update_sql, sql_values)
            logger.info(f"Updated warranty with SQL: {update_sql}")
            logger.info(f"Parameters: {sql_values}")
            
            # Update serial numbers
            cur.execute('DELETE FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
            if serial_numbers:
                for serial_number in serial_numbers:
                    if serial_number.strip():  # Only insert non-empty serial numbers
                        cur.execute('''
                            INSERT INTO serial_numbers (warranty_id, serial_number)
                            VALUES (%s, %s)
                        ''', (warranty_id, serial_number.strip()))
            
            # Update tags if provided
            if tag_ids is not None:
                # Remove existing tags
                cur.execute('DELETE FROM warranty_tags WHERE warranty_id = %s', (warranty_id,))
                
                # Add new tags
                for tag_id in tag_ids:
                    # Verify tag exists
                    cur.execute('SELECT id FROM tags WHERE id = %s', (tag_id,))
                    if cur.fetchone():
                        cur.execute('''
                            INSERT INTO warranty_tags (warranty_id, tag_id)
                            VALUES (%s, %s)
                        ''', (warranty_id, tag_id))
                    else:
                        logger.warning(f"Skipping non-existent tag ID: {tag_id}")
            
            conn.commit()
            
            return jsonify({"message": "Warranty updated successfully"}), 200
            
    except Exception as e:
        logger.error(f"Error updating warranty: {e}")
        if conn:
            conn.rollback()
        return jsonify({"error": "Failed to update warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/import', methods=['POST'])
@token_required
def import_warranties():
    if 'csv_file' not in request.files:
        return jsonify({"error": "No CSV file provided"}), 400

    file = request.files['csv_file']

    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if not file.filename.lower().endswith('.csv'):
        return jsonify({"error": "Invalid file type. Please upload a .csv file"}), 400

    user_id = request.user['id']
    conn = None
    imported_count = 0
    failed_rows = []
    used_name_date_pairs = set()  # Track names used in this import for a given purchase_date
    row_number = 1 # Start from 1 for header

    # Required and optional CSV headers
    REQUIRED_CSV_HEADERS = ['ProductName', 'PurchaseDate']
    OPTIONAL_CSV_HEADERS = [
        'ExpirationDate', 'IsLifetime', 'PurchasePrice', 'SerialNumber', 'ProductURL', 'Tags', 'Vendor', 'WarrantyType',
        'WarrantyDurationYears', 'WarrantyDurationMonths', 'WarrantyDurationDays'
    ]

    try:
        # Read the file content
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_reader = csv.DictReader(stream)

        # Validate headers
        headers = csv_reader.fieldnames
        # Check required headers first
        missing_required = [h for h in REQUIRED_CSV_HEADERS if h not in headers]
        if missing_required:
            return jsonify({"error": f"Missing required CSV columns: {', '.join(missing_required)}"}), 400
        
        # Check for unknown headers
        known_headers = set(REQUIRED_CSV_HEADERS + OPTIONAL_CSV_HEADERS)
        unknown_headers = [h for h in headers if h not in known_headers]
        if unknown_headers:
            logger.warning(f"CSV file contains unknown headers which will be ignored: {', '.join(unknown_headers)}")

        conn = get_db_connection()
        conn.autocommit = False # Start transaction

        with conn.cursor() as cur:
            for row in csv_reader:
                row_number += 1 # Increment for each data row (header is row 1)
                errors = []
                processed_row = {}

                try:
                    # --- Data Extraction and Basic Validation ---
                    product_name = row.get('ProductName', '').strip()
                    purchase_date_str = row.get('PurchaseDate', '').strip()
                    is_lifetime_str = row.get('IsLifetime', 'false').strip().lower()
                    
                    # New duration fields
                    warranty_duration_years_str = row.get('WarrantyDurationYears', '0').strip()
                    warranty_duration_months_str = row.get('WarrantyDurationMonths', '0').strip()
                    warranty_duration_days_str = row.get('WarrantyDurationDays', '0').strip()
                    
                    purchase_price_str = row.get('PurchasePrice', '').strip()
                    serial_numbers_str = row.get('SerialNumber', '').strip()
                    product_url = row.get('ProductURL', '').strip()
                    tags_str = row.get('Tags', '').strip() # Get Tags string
                    vendor = row.get('Vendor', '').strip() # Extract Vendor
                    warranty_type = row.get('WarrantyType', '').strip() # Extract Warranty Type
                    expiration_date_str = row.get('ExpirationDate', '').strip()

                    if not product_name:
                        errors.append("ProductName is required.")
                    if not purchase_date_str:
                        errors.append("PurchaseDate is required.")

                    # --- Type/Format Validation --- 
                    try:
                        purchase_date_dt = date_parse(purchase_date_str)
                        purchase_date = purchase_date_dt.date()
                    except ValueError:
                        errors.append("Invalid PurchaseDate format.")
                        purchase_date = None # Set to None to prevent further errors

                    is_lifetime = is_lifetime_str == 'true'
                    expiration_date = None
                    warranty_duration_years = 0
                    warranty_duration_months = 0
                    warranty_duration_days = 0

                    if not is_lifetime:
                        try:
                            warranty_duration_years = int(warranty_duration_years_str) if warranty_duration_years_str else 0
                            warranty_duration_months = int(warranty_duration_months_str) if warranty_duration_months_str else 0
                            warranty_duration_days = int(warranty_duration_days_str) if warranty_duration_days_str else 0

                            if warranty_duration_years < 0 or warranty_duration_months < 0 or warranty_duration_days < 0:
                                errors.append("Warranty duration components cannot be negative.")
                            if (
                                warranty_duration_years == 0 and
                                warranty_duration_months == 0 and
                                warranty_duration_days == 0 and
                                not expiration_date_str
                            ):
                                errors.append("Either duration (Years, Months, Days) or an ExpirationDate is required unless IsLifetime is TRUE.")
                            if warranty_duration_years > 999:
                                errors.append("WarrantyDurationYears must be 999 or less.")
                        except ValueError:
                            errors.append("WarrantyDurationYears, WarrantyDurationMonths, WarrantyDurationDays must be valid numbers.")
                    
                    purchase_price = None
                    if purchase_price_str:
                        try:
                            purchase_price = float(purchase_price_str)
                            if purchase_price < 0:
                                errors.append("PurchasePrice cannot be negative.")
                        except ValueError:
                            errors.append("PurchasePrice must be a valid number.")

                    # Calculate expiration date if valid
                    if not errors and not is_lifetime and purchase_date:
                        expiration_date_str = row.get('ExpirationDate', '').strip()
                        # Check if duration is zero and an exact expiration date is provided
                        if (
                            warranty_duration_years == 0 and
                            warranty_duration_months == 0 and
                            warranty_duration_days == 0 and
                            expiration_date_str
                        ):
                            try:
                                expiration_date = date_parse(expiration_date_str).date()
                                if expiration_date < purchase_date:
                                    errors.append("ExpirationDate cannot be before PurchaseDate.")
                            except ValueError:
                                errors.append("Invalid ExpirationDate format. Use YYYY-MM-DD.")
                        # Existing duration calculation logic
                        elif (
                            warranty_duration_years > 0 or
                            warranty_duration_months > 0 or
                            warranty_duration_days > 0
                        ):
                            try:
                                expiration_date = purchase_date + relativedelta(
                                    years=warranty_duration_years,
                                    months=warranty_duration_months,
                                    days=warranty_duration_days
                                )
                            except Exception as calc_err:
                                logger.error(f"[Import] Error calculating expiration date for row {row_number}: {calc_err}")
                                errors.append("Failed to calculate expiration date from duration components.")
                                expiration_date = None
                        # If no duration and no exact date is provided for a non-lifetime warranty
                        else:
                            errors.append("Either duration (Years, Months, Days) or an ExpirationDate is required unless IsLifetime is TRUE.")

                    # Split serial numbers
                    serial_numbers = [sn.strip() for sn in serial_numbers_str.split(',') if sn.strip()] if serial_numbers_str else []

                    # --- Process Tags --- 
                    tag_ids_to_link = []
                    if tags_str:
                        tag_names = [name.strip() for name in tags_str.split(',') if name.strip()]
                        if tag_names:
                            # Find existing tag IDs (case-insensitive) for THIS USER
                            placeholders = ', '.join(['%s'] * len(tag_names))
                            # Include user_id in the lookup
                            sql = f"SELECT id, LOWER(name) FROM tags WHERE LOWER(name) IN ({placeholders}) AND user_id = %s"
                            cur.execute(sql, [name.lower() for name in tag_names] + [user_id]) # Add user_id
                            existing_tags = {name_lower: tag_id for tag_id, name_lower in cur.fetchall()}
                            
                            processed_tag_ids = []
                            tags_to_create = []
                            
                            for name in tag_names:
                                name_lower = name.lower()
                                if name_lower in existing_tags:
                                    processed_tag_ids.append(existing_tags[name_lower])
                                else:
                                    # Avoid queuing the same new tag multiple times within the same row
                                    if name_lower not in [t['name_lower'] for t in tags_to_create]:
                                        tags_to_create.append({'name': name, 'name_lower': name_lower})
                            
                            # Create tags that don't exist for this user
                            if tags_to_create:
                                default_color = '#808080' # Default color for new tags
                                for tag_data in tags_to_create:
                                    try:
                                        # Insert new tag with default color, preserving original case for name, AND user_id
                                        cur.execute(
                                            "INSERT INTO tags (name, color, user_id) VALUES (%s, %s, %s) RETURNING id",
                                            (tag_data['name'], default_color, user_id) # Add user_id
                                        )
                                        new_tag_id = cur.fetchone()[0]
                                        processed_tag_ids.append(new_tag_id)
                                        logger.info(f"Created new tag '{(tag_data['name'])}' with ID {new_tag_id} for user {user_id} during CSV import.")
                                    except Exception as tag_insert_err:
                                        # If tag creation fails (e.g., unique constraint conflict due to race condition),
                                        # ensure the constraint includes user_id
                                        logger.error(f"Error creating tag '{(tag_data['name'])}' for user {user_id} during import: {tag_insert_err}")
                                        # Attempt to fetch the ID again in case it was created by another process
                                        cur.execute("SELECT id FROM tags WHERE LOWER(name) = %s AND user_id = %s", (tag_data['name_lower'], user_id))
                                        existing_id_result = cur.fetchone()
                                        if existing_id_result:
                                            processed_tag_ids.append(existing_id_result[0])
                                        else:
                                             # Add error to the row if tag creation failed and wasn't found
                                            errors.append(f"Failed to create or find tag: {(tag_data['name'])}")
                                            
                            # Consolidate tag IDs to link
                            if processed_tag_ids:
                                tag_ids_to_link = list(set(processed_tag_ids)) # Ensure unique IDs

                    # --- Check for Duplicates and auto-append suffix --- 
                    if not errors and product_name and purchase_date:
                        def is_name_taken(name_candidate):
                            cur.execute(
                                "SELECT 1 FROM warranties WHERE user_id = %s AND product_name = %s AND purchase_date = %s LIMIT 1",
                                (user_id, name_candidate, purchase_date)
                            )
                            return cur.fetchone() is not None or (name_candidate, purchase_date) in used_name_date_pairs

                        if is_name_taken(product_name):
                            base_name = product_name
                            suffix_index = 1
                            while True:
                                candidate_name = f"{base_name} ({suffix_index})"
                                if not is_name_taken(candidate_name):
                                    logger.info(f"[Import] Duplicate detected for row {row_number}. Renaming '{base_name}' to '{candidate_name}' for purchase date {purchase_date}.")
                                    product_name = candidate_name
                                    break
                                suffix_index += 1
                    
                    # --- If errors, skip row --- 
                    if errors:
                        failed_rows.append({"row": row_number, "errors": errors})
                        continue

                    # --- Get user's preferred currency code ---
                    user_currency_code = 'USD'  # Default fallback
                    try:
                        # Get user's preferred currency symbol from their preferences
                        cur.execute("""
                            SELECT currency_symbol FROM user_preferences 
                            WHERE user_id = %s
                        """, (user_id,))
                        currency_result = cur.fetchone()
                        
                        if currency_result and currency_result[0]:
                            user_symbol = currency_result[0]
                            # Map common currency symbols to currency codes (same as frontend logic)
                            symbol_to_currency_map = {
                                '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR', '₩': 'KRW',
                                'CHF': 'CHF', 'C$': 'CAD', 'A$': 'AUD', 'kr': 'SEK', 'zł': 'PLN', 
                                'Kč': 'CZK', 'Ft': 'HUF', '₽': 'RUB', 'R$': 'BRL', '₦': 'NGN',
                                '₪': 'ILS', '₺': 'TRY', '₨': 'PKR', '৳': 'BDT', '฿': 'THB',
                                '₫': 'VND', 'RM': 'MYR', 'S$': 'SGD', 'Rp': 'IDR', '₱': 'PHP',
                                'NT$': 'TWD', 'HK$': 'HKD', '₮': 'MNT', '₸': 'KZT', '₼': 'AZN',
                                '₾': 'GEL', '₴': 'UAH', 'NZ$': 'NZD'
                            }
                            
                            if user_symbol in symbol_to_currency_map:
                                user_currency_code = symbol_to_currency_map[user_symbol]
                                logger.info(f"[Import] Using user's preferred currency: {user_symbol} -> {user_currency_code} for user {user_id}")
                            else:
                                logger.info(f"[Import] Unknown currency symbol '{user_symbol}' for user {user_id}, defaulting to USD")
                        else:
                            logger.info(f"[Import] No currency preference found for user {user_id}, defaulting to USD")
                    except Exception as currency_err:
                        logger.error(f"[Import] Error getting user currency preference: {currency_err}, defaulting to USD")

                    # --- Insert into Database --- 
                    cur.execute("""
                        INSERT INTO warranties (
                            product_name, purchase_date, expiration_date, 
                            product_url, purchase_price, user_id, is_lifetime, vendor, warranty_type,
                            warranty_duration_years, warranty_duration_months, warranty_duration_days, currency
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        product_name, purchase_date, expiration_date,
                        product_url, purchase_price, user_id, is_lifetime, vendor, warranty_type,
                        warranty_duration_years, warranty_duration_months, warranty_duration_days, user_currency_code
                    ))
                    warranty_id = cur.fetchone()[0]

                    # Insert serial numbers
                    if serial_numbers:
                        for serial_number in serial_numbers:
                            cur.execute("""
                                INSERT INTO serial_numbers (warranty_id, serial_number)
                                VALUES (%s, %s)
                            """, (warranty_id, serial_number))
                    
                    # Link tags
                    if tag_ids_to_link:
                        for tag_id in tag_ids_to_link:
                             cur.execute("""
                                INSERT INTO warranty_tags (warranty_id, tag_id)
                                VALUES (%s, %s)
                                ON CONFLICT (warranty_id, tag_id) DO NOTHING -- Avoid errors if somehow duplicated
                            """, (warranty_id, tag_id))

                    # Track the used name+date pair to avoid collisions within the same CSV import
                    used_name_date_pairs.add((product_name, purchase_date))

                    imported_count += 1

                except Exception as e:
                    logger.error(f"Error processing CSV row {row_number}: {e}")
                    failed_rows.append({"row": row_number, "errors": [f"Internal processing error: {str(e)}"]})
                    # Don't rollback yet, just record failure

            # --- Transaction Commit/Rollback --- 
            if imported_count > 0 and failed_rows:
                # Partial success: commit successful rows and return 200 with error details for failed rows
                conn.commit()
                final_success_count = imported_count
                final_failure_count = len(failed_rows)
                return jsonify({
                    "message": "CSV processed with some errors.",
                    "success_count": final_success_count,
                    "failure_count": final_failure_count,
                    "errors": failed_rows
                }), 200
            elif imported_count == 0 and failed_rows:
                # All rows failed: rollback and return 400
                conn.rollback()
                final_success_count = 0
                final_failure_count = len(failed_rows)
                return jsonify({
                    "error": "Import failed due to errors in all rows. No warranties were imported.",
                    "success_count": 0,
                    "failure_count": final_failure_count,
                    "errors": failed_rows
                }), 400
            else:
                # All rows succeeded
                conn.commit()
                final_success_count = imported_count
                final_failure_count = len(failed_rows)

        return jsonify({
            "message": "CSV processed.",
            "success_count": final_success_count,
            "failure_count": final_failure_count,
            "errors": failed_rows
        }), 200

    except Exception as e:
        if conn:
            conn.rollback() # Rollback on general error
        logger.error(f"Error importing CSV: {e}")
        return jsonify({"error": f"Failed to import CSV: {str(e)}"}), 500
    finally:
        if conn:
            conn.autocommit = True # Reset autocommit
            release_db_connection(conn) 

@warranties_bp.route('/admin/warranties', methods=['GET'])
@admin_required
def get_all_warranties():
    """Get all warranties from all users (admin only)"""
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all warranties from all users with user information (exclude archived by default)
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                    w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url,
                    u.username, u.email, u.first_name, u.last_name,
                    CASE
                        WHEN COUNT(c.id) = 0 THEN 'NO_CLAIMS'
                        WHEN BOOL_OR(c.status IN ('Submitted', 'In Progress')) THEN 'OPEN'
                        ELSE 'FINISHED'
                    END AS claim_status_summary
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                LEFT JOIN warranty_claims c ON w.id = c.warranty_id
                WHERE w.archived_at IS NULL
                GROUP BY w.id, u.id
                ORDER BY u.username, CASE WHEN w.is_lifetime THEN 1 ELSE 0 END, w.expiration_date NULLS LAST, w.product_name
            ''')
                
            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []
            
            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)
                
                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers
                
                # Get tags for this warranty
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags
                
                # Add user display name for better UI
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''
                
                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'
                
                warranties_list.append(warranty_dict)
                
            return jsonify(warranties_list)
    except Exception as e:
        logger.error(f"Error retrieving all warranties: {e}")
        return jsonify({"error": "Failed to retrieve all warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn) 

@warranties_bp.route('/warranties/global', methods=['GET'])
@token_required
def get_global_warranties():
    """Get all warranties from all users (public view for all authenticated users)"""
    conn = None
    try:
        # Check if global view is enabled for this user
        user_is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get both global view settings
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}
            
            # Check if global view is enabled at all
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            if not global_view_enabled:
                return jsonify({"error": "Global view is disabled by administrator"}), 403
            
            # Check if global view is restricted to admins only
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            if admin_only and not user_is_admin:
                return jsonify({"error": "Global view is restricted to administrators only"}), 403
        
        # Release the connection since we'll get a new one below
        release_db_connection(conn)
        conn = None
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get all warranties from all users with user information (exclude archived for default view)
            # Use correlated subqueries for claim status to avoid GROUP BY collapsing or miscounting
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                    w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number,
                    u.username, u.email, u.first_name, u.last_name,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id AND c.status IN ('Submitted', 'In Progress')
                        ) THEN 'OPEN'
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id
                        ) THEN 'FINISHED'
                        ELSE 'NO_CLAIMS'
                    END AS claim_status_summary
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                WHERE w.archived_at IS NULL
                ORDER BY u.username, CASE WHEN w.is_lifetime THEN 1 ELSE 0 END, w.expiration_date NULLS LAST, w.product_name
            ''')
                
            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []
            
            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)
                
                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers
                
                # Get tags for this warranty
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags
                
                # Add user display name for better UI
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''
                
                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'
                
                warranties_list.append(warranty_dict)
                
            return jsonify(warranties_list)
    except Exception as e:
        logger.error(f"Error retrieving global warranties: {e}")
        return jsonify({"error": "Failed to retrieve global warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/warranties/global/archived', methods=['GET'])
@token_required
def get_global_warranties_archived():
    """Get archived warranties from all users (public view for all authenticated users)"""
    conn = None
    try:
        # Check if global view is enabled for this user
        user_is_admin = request.user.get('is_admin', False)

        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get both global view settings
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}

            # Check if global view is enabled at all
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            if not global_view_enabled:
                return jsonify({"error": "Global view is disabled by administrator"}), 403

            # Check if global view is restricted to admins only
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            if admin_only and not user_is_admin:
                return jsonify({"error": "Global view is restricted to administrators only"}), 403

        # Release the connection since we'll get a new one below
        release_db_connection(conn)
        conn = None
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Get archived warranties from all users with user information
            # Use correlated subqueries for claim status to avoid GROUP BY collapsing or miscounting
            cur.execute('''
                SELECT 
                    w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                    w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                    w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, w.product_photo_path, w.currency,
                    w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                    w.invoice_url, w.manual_url, w.other_document_url, w.model_number,
                    u.username, u.email, u.first_name, u.last_name,
                    CASE
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id AND c.status IN ('Submitted', 'In Progress')
                        ) THEN 'OPEN'
                        WHEN EXISTS (
                            SELECT 1 FROM warranty_claims c 
                            WHERE c.warranty_id = w.id
                        ) THEN 'FINISHED'
                        ELSE 'NO_CLAIMS'
                    END AS claim_status_summary
                FROM warranties w
                JOIN users u ON w.user_id = u.id
                WHERE w.archived_at IS NOT NULL
                ORDER BY w.archived_at DESC NULLS LAST, w.updated_at DESC NULLS LAST, w.product_name
            ''')

            warranties = cur.fetchall()
            columns = [desc[0] for desc in cur.description]
            warranties_list = []

            for row in warranties:
                warranty_dict = dict(zip(columns, row))
                # Convert date objects to ISO format strings for JSON serialization
                for key, value in warranty_dict.items():
                    if isinstance(value, (datetime, date)):
                        warranty_dict[key] = value.isoformat()
                    # Convert Decimal objects to float for JSON serialization
                    elif isinstance(value, Decimal):
                        warranty_dict[key] = float(value)

                # Get serial numbers for this warranty
                warranty_id = warranty_dict['id']
                cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
                serial_numbers = [row[0] for row in cur.fetchall()]
                warranty_dict['serial_numbers'] = serial_numbers

                # Get tags for this warranty
                cur.execute('''
                    SELECT t.id, t.name, t.color
                    FROM tags t
                    JOIN warranty_tags wt ON t.id = wt.tag_id
                    WHERE wt.warranty_id = %s
                    ORDER BY t.name
                ''', (warranty_id,))
                tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
                warranty_dict['tags'] = tags

                # Add user display name for better UI
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''

                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'

                warranties_list.append(warranty_dict)

            return jsonify(warranties_list)
    except Exception as e:
        logger.error(f"Error retrieving archived global warranties: {e}")
        return jsonify({"error": "Failed to retrieve archived global warranties"}), 500
    finally:
        if conn:
            release_db_connection(conn)


@warranties_bp.route('/currencies', methods=['GET'])
@token_required
def get_currencies():
    """Get list of available currencies with their symbols"""
    try:
        currencies = [
            {'code': 'USD', 'name': 'US Dollar', 'symbol': '$'},
            {'code': 'EUR', 'name': 'Euro', 'symbol': '€'},
            {'code': 'GBP', 'name': 'British Pound', 'symbol': '£'},
            {'code': 'JPY', 'name': 'Japanese Yen', 'symbol': '¥'},
            {'code': 'CNY', 'name': 'Chinese Yuan', 'symbol': '¥'},
            {'code': 'INR', 'name': 'Indian Rupee', 'symbol': '₹'},
            {'code': 'KRW', 'name': 'South Korean Won', 'symbol': '₩'},
            {'code': 'CHF', 'name': 'Swiss Franc', 'symbol': 'CHF'},
            {'code': 'CAD', 'name': 'Canadian Dollar', 'symbol': 'C$'},
            {'code': 'AUD', 'name': 'Australian Dollar', 'symbol': 'A$'},
            {'code': 'SEK', 'name': 'Swedish Krona', 'symbol': 'kr'},
            {'code': 'NOK', 'name': 'Norwegian Krone', 'symbol': 'kr'},
            {'code': 'DKK', 'name': 'Danish Krone', 'symbol': 'kr'},
            {'code': 'PLN', 'name': 'Polish Złoty', 'symbol': 'zł'},
            {'code': 'CZK', 'name': 'Czech Koruna', 'symbol': 'Kč'},
            {'code': 'HUF', 'name': 'Hungarian Forint', 'symbol': 'Ft'},
            {'code': 'BGN', 'name': 'Bulgarian Lev', 'symbol': 'лв'},
            {'code': 'RON', 'name': 'Romanian Leu', 'symbol': 'lei'},
            {'code': 'HRK', 'name': 'Croatian Kuna', 'symbol': 'kn'},
            {'code': 'RUB', 'name': 'Russian Ruble', 'symbol': '₽'},
            {'code': 'BRL', 'name': 'Brazilian Real', 'symbol': 'R$'},
            {'code': 'MXN', 'name': 'Mexican Peso', 'symbol': '$'},
            {'code': 'ARS', 'name': 'Argentine Peso', 'symbol': '$'},
            {'code': 'CLP', 'name': 'Chilean Peso', 'symbol': '$'},
            {'code': 'COP', 'name': 'Colombian Peso', 'symbol': '$'},
            {'code': 'PEN', 'name': 'Peruvian Sol', 'symbol': 'S/'},
            {'code': 'VES', 'name': 'Venezuelan Bolívar', 'symbol': 'Bs'},
            {'code': 'ZAR', 'name': 'South African Rand', 'symbol': 'R'},
            {'code': 'EGP', 'name': 'Egyptian Pound', 'symbol': '£'},
            {'code': 'NGN', 'name': 'Nigerian Naira', 'symbol': '₦'},
            {'code': 'KES', 'name': 'Kenyan Shilling', 'symbol': 'KSh'},
            {'code': 'GHS', 'name': 'Ghanaian Cedi', 'symbol': '₵'},
            {'code': 'MAD', 'name': 'Moroccan Dirham', 'symbol': 'DH'},
            {'code': 'TND', 'name': 'Tunisian Dinar', 'symbol': 'DT'},
            {'code': 'AED', 'name': 'UAE Dirham', 'symbol': 'AED'},
            {'code': 'SAR', 'name': 'Saudi Riyal', 'symbol': 'SR'},
            {'code': 'QAR', 'name': 'Qatari Riyal', 'symbol': 'QR'},
            {'code': 'KWD', 'name': 'Kuwaiti Dinar', 'symbol': 'KD'},
            {'code': 'BHD', 'name': 'Bahraini Dinar', 'symbol': 'BD'},
            {'code': 'OMR', 'name': 'Omani Rial', 'symbol': 'OR'},
            {'code': 'JOD', 'name': 'Jordanian Dinar', 'symbol': 'JD'},
            {'code': 'LBP', 'name': 'Lebanese Pound', 'symbol': 'LL'},
            {'code': 'ILS', 'name': 'Israeli Shekel', 'symbol': '₪'},
            {'code': 'TRY', 'name': 'Turkish Lira', 'symbol': '₺'},
            {'code': 'IRR', 'name': 'Iranian Rial', 'symbol': '﷼'},
            {'code': 'PKR', 'name': 'Pakistani Rupee', 'symbol': '₨'},
            {'code': 'BDT', 'name': 'Bangladeshi Taka', 'symbol': '৳'},
            {'code': 'LKR', 'name': 'Sri Lankan Rupee', 'symbol': 'Rs'},
            {'code': 'NPR', 'name': 'Nepalese Rupee', 'symbol': 'Rs'},
            {'code': 'BTN', 'name': 'Bhutanese Ngultrum', 'symbol': 'Nu'},
            {'code': 'MMK', 'name': 'Myanmar Kyat', 'symbol': 'K'},
            {'code': 'THB', 'name': 'Thai Baht', 'symbol': '฿'},
            {'code': 'VND', 'name': 'Vietnamese Dong', 'symbol': '₫'},
            {'code': 'LAK', 'name': 'Lao Kip', 'symbol': '₭'},
            {'code': 'KHR', 'name': 'Cambodian Riel', 'symbol': '៛'},
            {'code': 'MYR', 'name': 'Malaysian Ringgit', 'symbol': 'RM'},
            {'code': 'SGD', 'name': 'Singapore Dollar', 'symbol': 'S$'},
            {'code': 'IDR', 'name': 'Indonesian Rupiah', 'symbol': 'Rp'},
            {'code': 'PHP', 'name': 'Philippine Peso', 'symbol': '₱'},
            {'code': 'TWD', 'name': 'Taiwan Dollar', 'symbol': 'NT$'},
            {'code': 'HKD', 'name': 'Hong Kong Dollar', 'symbol': 'HK$'},
            {'code': 'MOP', 'name': 'Macanese Pataca', 'symbol': 'MOP'},
            {'code': 'KPW', 'name': 'North Korean Won', 'symbol': '₩'},
            {'code': 'MNT', 'name': 'Mongolian Tugrik', 'symbol': '₮'},
            {'code': 'KZT', 'name': 'Kazakhstani Tenge', 'symbol': '₸'},
            {'code': 'UZS', 'name': 'Uzbekistani Som', 'symbol': 'soʻm'},
            {'code': 'TJS', 'name': 'Tajikistani Somoni', 'symbol': 'SM'},
            {'code': 'KGS', 'name': 'Kyrgyzstani Som', 'symbol': 'с'},
            {'code': 'TMT', 'name': 'Turkmenistani Manat', 'symbol': 'T'},
            {'code': 'AFN', 'name': 'Afghan Afghani', 'symbol': '؋'},
            {'code': 'AMD', 'name': 'Armenian Dram', 'symbol': '֏'},
            {'code': 'AZN', 'name': 'Azerbaijani Manat', 'symbol': '₼'},
            {'code': 'GEL', 'name': 'Georgian Lari', 'symbol': '₾'},
            {'code': 'MDL', 'name': 'Moldovan Leu', 'symbol': 'L'},
            {'code': 'UAH', 'name': 'Ukrainian Hryvnia', 'symbol': '₴'},
            {'code': 'BYN', 'name': 'Belarusian Ruble', 'symbol': 'Br'},
            {'code': 'RSD', 'name': 'Serbian Dinar', 'symbol': 'дин'},
            {'code': 'MKD', 'name': 'Macedonian Denar', 'symbol': 'ден'},
            {'code': 'ALL', 'name': 'Albanian Lek', 'symbol': 'L'},
            {'code': 'BAM', 'name': 'Bosnia-Herzegovina Mark', 'symbol': 'KM'},
            {'code': 'ISK', 'name': 'Icelandic Króna', 'symbol': 'kr'},
            {'code': 'FJD', 'name': 'Fijian Dollar', 'symbol': 'FJ$'},
            {'code': 'PGK', 'name': 'Papua New Guinea Kina', 'symbol': 'K'},
            {'code': 'SBD', 'name': 'Solomon Islands Dollar', 'symbol': 'SI$'},
            {'code': 'TOP', 'name': 'Tongan Paʻanga', 'symbol': 'T$'},
            {'code': 'VUV', 'name': 'Vanuatu Vatu', 'symbol': 'VT'},
            {'code': 'WST', 'name': 'Samoan Tala', 'symbol': 'WS$'},
            {'code': 'XPF', 'name': 'CFP Franc', 'symbol': '₣'},
            {'code': 'NZD', 'name': 'New Zealand Dollar', 'symbol': 'NZ$'}
        ]
        
        return jsonify(currencies)
        
    except Exception as e:
        logger.error(f"Error getting currencies: {e}")
        return jsonify([{'code': 'USD', 'name': 'US Dollar', 'symbol': '$'}]), 500


@warranties_bp.route('/debug/warranty/<int:warranty_id>', methods=['GET'])
@token_required
def get_warranty_debug(warranty_id):
    """Get detailed information about a specific warranty (for debugging/status page)"""
    conn = None
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        with conn.cursor() as cur:
            # Check if warranty exists and user has access to it
            if is_admin:
                cur.execute('''
                    SELECT w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                           w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                           w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, 
                           w.product_photo_path, w.currency, w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                           u.username, u.email, u.first_name, u.last_name
                    FROM warranties w
                    JOIN users u ON w.user_id = u.id
                    WHERE w.id = %s
                ''', (warranty_id,))
            else:
                cur.execute('''
                    SELECT w.id, w.product_name, w.purchase_date, w.expiration_date, w.invoice_path, w.manual_path, w.other_document_path, 
                           w.product_url, w.notes, w.purchase_price, w.user_id, w.created_at, w.updated_at, w.is_lifetime, 
                           w.vendor, w.warranty_type, w.warranty_duration_years, w.warranty_duration_months, w.warranty_duration_days, 
                           w.product_photo_path, w.currency, w.paperless_invoice_id, w.paperless_manual_id, w.paperless_photo_id, w.paperless_other_id,
                           u.username, u.email, u.first_name, u.last_name
                    FROM warranties w
                    JOIN users u ON w.user_id = u.id
                    WHERE w.id = %s AND w.user_id = %s
                ''', (warranty_id, user_id))
            
            warranty = cur.fetchone()
            
            if not warranty:
                return jsonify({"error": "Warranty not found or you don't have permission to access it"}), 404
            
            # Convert to dictionary
            columns = [desc[0] for desc in cur.description]
            warranty_dict = dict(zip(columns, warranty))
            
            # Convert date objects to ISO format strings for JSON serialization
            for key, value in warranty_dict.items():
                if isinstance(value, (datetime, date)):
                    warranty_dict[key] = value.isoformat()
                # Convert Decimal objects to float for JSON serialization
                elif isinstance(value, Decimal):
                    warranty_dict[key] = float(value)
            
            # Get serial numbers for this warranty
            cur.execute('SELECT serial_number FROM serial_numbers WHERE warranty_id = %s', (warranty_id,))
            serial_numbers = [row[0] for row in cur.fetchall()]
            warranty_dict['serial_numbers'] = serial_numbers
            
            # Get tags for this warranty
            cur.execute('''
                SELECT t.id, t.name, t.color
                FROM tags t
                JOIN warranty_tags wt ON t.id = wt.tag_id
                WHERE wt.warranty_id = %s
                ORDER BY t.name
            ''', (warranty_id,))
            tags = [{'id': t[0], 'name': t[1], 'color': t[2]} for t in cur.fetchall()]
            warranty_dict['tags'] = tags
            
            # Add user display name for better UI (if admin is viewing)
            if is_admin:
                first_name = warranty_dict.get('first_name', '').strip() if warranty_dict.get('first_name') else ''
                last_name = warranty_dict.get('last_name', '').strip() if warranty_dict.get('last_name') else ''
                username = warranty_dict.get('username', '').strip() if warranty_dict.get('username') else ''
                
                if first_name and last_name:
                    warranty_dict['user_display_name'] = f"{first_name} {last_name}"
                elif first_name:
                    warranty_dict['user_display_name'] = first_name
                elif username:
                    warranty_dict['user_display_name'] = username
                else:
                    warranty_dict['user_display_name'] = 'Unknown User'
            
            return jsonify(warranty_dict)
            
    except Exception as e:
        logger.error(f"Error retrieving warranty {warranty_id}: {e}")
        return jsonify({"error": "Failed to retrieve warranty"}), 500
    finally:
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/timezones', methods=['GET'])
@token_required
def get_timezones():
    """Get list of available timezones grouped by region"""
    try:
        # Get all timezones and group them by region
        all_timezones = pytz.all_timezones
        grouped_timezones = {}
        
        for tz in sorted(all_timezones):
            # Skip deprecated/non-standard timezones
            if '/' not in tz or tz.startswith(('Etc/', 'SystemV/', 'US/', 'posix/', 'right/')):
                continue
                
            region = tz.split('/')[0]
            if region not in grouped_timezones:
                grouped_timezones[region] = []
            
            # Create display name (replace underscores with spaces)
            display_name = tz.split('/', 1)[1].replace('_', ' ')
            grouped_timezones[region].append({
                'value': tz,
                'label': display_name,
                'full_name': tz
            })
        
        # Convert to frontend expected format: array of objects with region and timezones
        timezone_groups_array = []
        for region, timezones in grouped_timezones.items():
            timezone_groups_array.append({
                'region': region,
                'timezones': timezones
            })
        
        return jsonify(timezone_groups_array), 200
        
    except Exception as e:
        logger.error(f"Error getting timezones: {e}")
        # Return a basic fallback list in correct format
        fallback_timezones = [
            {
                'region': 'UTC',
                'timezones': [{'value': 'UTC', 'label': 'UTC', 'full_name': 'UTC'}]
            },
            {
                'region': 'America',
                'timezones': [
                    {'value': 'America/New_York', 'label': 'New York', 'full_name': 'America/New_York'},
                    {'value': 'America/Chicago', 'label': 'Chicago', 'full_name': 'America/Chicago'},
                    {'value': 'America/Denver', 'label': 'Denver', 'full_name': 'America/Denver'},
                    {'value': 'America/Los_Angeles', 'label': 'Los Angeles', 'full_name': 'America/Los_Angeles'},
                    {'value': 'America/Halifax', 'label': 'Halifax', 'full_name': 'America/Halifax'}
                ]
            },
            {
                'region': 'Europe',
                'timezones': [
                    {'value': 'Europe/London', 'label': 'London', 'full_name': 'Europe/London'},
                    {'value': 'Europe/Paris', 'label': 'Paris', 'full_name': 'Europe/Paris'},
                    {'value': 'Europe/Berlin', 'label': 'Berlin', 'full_name': 'Europe/Berlin'}
                ]
            }
        ]
        return jsonify(fallback_timezones), 200

@warranties_bp.route('/locales', methods=['GET'])
def get_locales():
    """Get list of supported locales/languages"""
    try:
        # Import the supported languages from localization
        try:
            from .localization import SUPPORTED_LANGUAGES
        except ImportError:
            from localization import SUPPORTED_LANGUAGES
        
        # Language code to name mapping
        language_names = {
            'en': 'English',
            'fr': 'Français',
            'es': 'Español', 
            'de': 'Deutsch',
            'it': 'Italiano',
            'cs': 'Čeština',
            'nl': 'Nederlands',
            'hi': 'हिन्दी',
            'fa': 'فارسی',
            'ar': 'العربية',
            'ru': 'Русский',
            'uk': 'Українська',
            'zh_CN': '简体中文',
            'zh_HK': '繁體中文',
            'ja': '日本語',
            'pt': 'Português',
            'ko': '한국어',
            'tr': 'Türkçe',
            'pl': 'Polski'
        }
        
        locales = []
        for lang_code in SUPPORTED_LANGUAGES:
            locales.append({
                'code': lang_code,
                'name': language_names.get(lang_code, lang_code),
                'native_name': language_names.get(lang_code, lang_code)
            })
        
        return jsonify(locales), 200
        
    except ImportError:
        # Fallback if localization module is not available
        fallback_locales = [
            {'code': 'en', 'name': 'English', 'native_name': 'English'},
            {'code': 'fr', 'name': 'French', 'native_name': 'Français'},
            {'code': 'es', 'name': 'Spanish', 'native_name': 'Español'},
            {'code': 'de', 'name': 'German', 'native_name': 'Deutsch'}
        ]
        return jsonify(fallback_locales), 200
    except Exception as e:
        logger.error(f"Error getting locales: {e}")
        return jsonify([{'code': 'en', 'name': 'English', 'native_name': 'English'}]), 500

# ====== WARRANTY CLAIMS ENDPOINTS ======

@warranties_bp.route('/warranties/<int:warranty_id>/claims', methods=['POST'])
@token_required
def create_claim(warranty_id):
    """Create a new warranty claim"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Verify warranty exists and user owns it
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, product_name FROM warranties 
            WHERE id = %s AND user_id = %s
        """, (warranty_id, user_id))
        
        warranty = cur.fetchone()
        if not warranty:
            return jsonify({'error': 'Warranty not found or access denied'}), 404
        
        # Validate required fields
        claim_date = data.get('claim_date')
        status = data.get('status', 'Submitted')

        # Process optional fields, converting empty strings to None for the database
        claim_number_raw = data.get('claim_number')
        claim_number = claim_number_raw.strip() if claim_number_raw else None

        description_raw = data.get('description')
        description = description_raw.strip() if description_raw else None

        resolution_raw = data.get('resolution')
        resolution = resolution_raw.strip() if resolution_raw else None

        resolution_date = data.get('resolution_date')

        if not claim_date:
            return jsonify({'error': 'Claim date is required'}), 400

        # Parse dates
        try:
            parsed_claim_date = date_parse(claim_date).date() if isinstance(claim_date, str) else claim_date
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid claim date format'}), 400

        parsed_resolution_date = None
        if resolution_date:
            try:
                parsed_resolution_date = date_parse(resolution_date).date() if isinstance(resolution_date, str) else resolution_date
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid resolution date format'}), 400

        # Validate status
        valid_statuses = ['Submitted', 'In Progress', 'Approved', 'Denied', 'Resolved', 'Cancelled']
        if status not in valid_statuses:
            return jsonify({'error': f"Invalid claim status. Must be one of: {', '.join(valid_statuses)}"}), 400

        # Insert new claim
        cur.execute("""
            INSERT INTO warranty_claims 
            (warranty_id, claim_date, status, claim_number, description, resolution, resolution_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at, updated_at
        """, (warranty_id, parsed_claim_date, status, claim_number, description, 
              resolution, parsed_resolution_date))
        
        result = cur.fetchone()
        claim_id = result[0]
        created_at = result[1]
        updated_at = result[2]
        
        conn.commit()
        
        # Return the created claim
        claim = {
            'id': claim_id,
            'warranty_id': warranty_id,
            'claim_date': parsed_claim_date.isoformat(),
            'status': status,
            'claim_number': claim_number,
            'description': description,
            'resolution': resolution,
            'resolution_date': parsed_resolution_date.isoformat() if parsed_resolution_date else None,
            'created_at': created_at.isoformat() if created_at else None,
            'updated_at': updated_at.isoformat() if updated_at else None
        }
        
        logger.info(f"Created claim {claim_id} for warranty {warranty_id} by user {user_id}")
        return jsonify(claim), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error creating claim: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/claims', methods=['GET'])
@token_required
def get_claims(warranty_id):
    """Get all claims for a warranty"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        is_admin = request.user.get('is_admin', False)
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # First check if warranty exists and user owns it
        cur.execute("""
            SELECT id, product_name, user_id FROM warranties 
            WHERE id = %s AND user_id = %s
        """, (warranty_id, user_id))
        
        warranty = cur.fetchone()
        
        # If user doesn't own the warranty, check if global view access is allowed
        if not warranty:
            # Check if global view is enabled and user has access
            cur.execute("SELECT key, value FROM site_settings WHERE key IN ('global_view_enabled', 'global_view_admin_only')")
            settings = {row[0]: row[1] for row in cur.fetchall()}
            
            global_view_enabled = settings.get('global_view_enabled', 'true').lower() == 'true'
            admin_only = settings.get('global_view_admin_only', 'false').lower() == 'true'
            
            # Check if user has global view access
            if not global_view_enabled or (admin_only and not is_admin):
                return jsonify({'error': 'Warranty not found or access denied'}), 404
            
            # Check if warranty exists (regardless of ownership)
            cur.execute("""
                SELECT id, product_name, user_id FROM warranties 
                WHERE id = %s
            """, (warranty_id,))
            
            warranty = cur.fetchone()
            if not warranty:
                return jsonify({'error': 'Warranty not found'}), 404
        
        # Get all claims for this warranty
        cur.execute("""
            SELECT id, warranty_id, claim_date, status, claim_number, description, 
                   resolution, resolution_date, created_at, updated_at
            FROM warranty_claims 
            WHERE warranty_id = %s
            ORDER BY claim_date DESC, created_at DESC
        """, (warranty_id,))
        
        claims = []
        for row in cur.fetchall():
            claim = {
                'id': row[0],
                'warranty_id': row[1],
                'claim_date': row[2].isoformat() if row[2] else None,
                'status': row[3],
                'claim_number': row[4],
                'description': row[5],
                'resolution': row[6],
                'resolution_date': row[7].isoformat() if row[7] else None,
                'created_at': row[8].isoformat() if row[8] else None,
                'updated_at': row[9].isoformat() if row[9] else None
            }
            claims.append(claim)
        
        return jsonify(claims), 200
        
    except Exception as e:
        logger.error(f"Error getting claims: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>', methods=['PUT'])
@token_required
def update_claim(warranty_id, claim_id):
    """Update a warranty claim"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        # Verify warranty exists and user owns it
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT w.id, w.product_name 
            FROM warranties w
            JOIN warranty_claims c ON w.id = c.warranty_id
            WHERE w.id = %s AND c.id = %s AND w.user_id = %s
        """, (warranty_id, claim_id, user_id))
        
        result = cur.fetchone()
        if not result:
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404
        
        # Get current claim data
        cur.execute("""
            SELECT claim_date, status, claim_number, description, resolution, resolution_date
            FROM warranty_claims 
            WHERE id = %s AND warranty_id = %s
        """, (claim_id, warranty_id))
        
        current_claim = cur.fetchone()
        if not current_claim:
            return jsonify({'error': 'Claim not found'}), 404
        
        # Update fields (keep existing values if not provided)
        claim_date = data.get('claim_date')
        status = data.get('status', current_claim[1])
        claim_number = data.get('claim_number', current_claim[2])
        description = data.get('description', current_claim[3])
        resolution = data.get('resolution', current_claim[4])
        resolution_date = data.get('resolution_date', current_claim[5])
        
        # Parse dates
        if claim_date:
            try:
                parsed_claim_date = date_parse(claim_date).date() if isinstance(claim_date, str) else claim_date
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid claim date format'}), 400
        else:
            parsed_claim_date = current_claim[0]
            
        if resolution_date:
            try:
                parsed_resolution_date = date_parse(resolution_date).date() if isinstance(resolution_date, str) else resolution_date
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid resolution date format'}), 400
        else:
            parsed_resolution_date = current_claim[5]
        
        # Validate status
        valid_statuses = ['Submitted', 'In Progress', 'Approved', 'Denied', 'Resolved', 'Cancelled']
        if status not in valid_statuses:
            return jsonify({'error': f"Invalid claim status. Must be one of: {', '.join(valid_statuses)}"}), 400

        # Handle empty strings as None
        claim_number = claim_number.strip() if claim_number else None
        description = description.strip() if description else None
        resolution = resolution.strip() if resolution else None
        
        # Update the claim
        cur.execute("""
            UPDATE warranty_claims 
            SET claim_date = %s, status = %s, claim_number = %s, description = %s, 
                resolution = %s, resolution_date = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND warranty_id = %s
            RETURNING updated_at
        """, (parsed_claim_date, status, claim_number, description, resolution, 
              parsed_resolution_date, claim_id, warranty_id))
        
        updated_at = cur.fetchone()[0]
        conn.commit()
        
        # Return updated claim
        claim = {
            'id': claim_id,
            'warranty_id': warranty_id,
            'claim_date': parsed_claim_date.isoformat() if parsed_claim_date else None,
            'status': status,
            'claim_number': claim_number,
            'description': description,
            'resolution': resolution,
            'resolution_date': parsed_resolution_date.isoformat() if parsed_resolution_date else None,
            'updated_at': updated_at.isoformat() if updated_at else None
        }
        
        logger.info(f"Updated claim {claim_id} for warranty {warranty_id} by user {user_id}")
        return jsonify(claim), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error updating claim: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

@warranties_bp.route('/warranties/<int:warranty_id>/claims/<int:claim_id>', methods=['DELETE'])
@token_required
def delete_claim(warranty_id, claim_id):
    """Delete a warranty claim"""
    conn = None
    cur = None
    
    try:
        user_id = request.user['id']
        # Verify warranty exists and user owns it
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT w.id, w.product_name 
            FROM warranties w
            JOIN warranty_claims c ON w.id = c.warranty_id
            WHERE w.id = %s AND c.id = %s AND w.user_id = %s
        """, (warranty_id, claim_id, user_id))
        
        result = cur.fetchone()
        if not result:
            return jsonify({'error': 'Warranty or claim not found or access denied'}), 404
        
        # Delete the claim
        cur.execute("""
            DELETE FROM warranty_claims 
            WHERE id = %s AND warranty_id = %s
        """, (claim_id, warranty_id))
        
        if cur.rowcount == 0:
            return jsonify({'error': 'Claim not found'}), 404
        
        conn.commit()
        
        logger.info(f"Deleted claim {claim_id} for warranty {warranty_id} by user {user_id}")
        return jsonify({'message': 'Claim deleted successfully'}), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Error deleting claim: {e}")
        return jsonify({'error': 'Internal server error'}), 500
        
    finally:
        if cur:
            cur.close()
        if conn:
            release_db_connection(conn)

 