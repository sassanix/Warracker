"""
Paperless-ngx API Handler for Warracker

This module provides functionality to interact with Paperless-ngx API
for uploading, retrieving, and managing documents.
"""

import requests
import logging
from typing import Optional, Dict, Any, Tuple
import os
from io import BytesIO
import hashlib

logger = logging.getLogger(__name__)


class PaperlessHandler:
    """Handle interactions with Paperless-ngx API"""
    
    def __init__(self, paperless_url: str, api_token: str):
        """
        Initialize Paperless handler
        
        Args:
            paperless_url: Base URL of Paperless-ngx instance (e.g., https://paperless.example.com)
            api_token: API token for authentication
        """
        self.paperless_url = paperless_url.rstrip('/')
        self.base_url = self.paperless_url  # Add base_url alias for compatibility
        self.api_token = api_token
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Token {api_token}',
            'User-Agent': 'Warracker-PaperlessIntegration/1.0',
            'Accept': 'application/json'
        })
        # Ensure no environment-provided authentication (proxies, netrc) interferes
        try:
            self.session.trust_env = False
        except Exception:
            pass

    def _build_url(self, url_or_path: str) -> str:
        """Build absolute URL for Paperless-ngx API calls."""
        if url_or_path.startswith('http://') or url_or_path.startswith('https://'):
            return url_or_path
        return f"{self.paperless_url.rstrip('/')}/{url_or_path.lstrip('/')}"

    def _request(self, method: str, url_or_path: str, **kwargs) -> requests.Response:
        """
        Perform a request ensuring token-only auth:
        - Always include Authorization: Token <token>
        - Clear cookies before sending (avoid session/CSRF/2FA paths)
        - Do not auto-follow redirects to login pages unless explicitly requested
        """
        headers = kwargs.pop('headers', {}) or {}
        merged_headers = {
            'Authorization': f'Token {self.api_token}',
            'User-Agent': 'Warracker-PaperlessIntegration/1.0',
            'Accept': 'application/json'
        }
        merged_headers.update(headers)

        # Avoid sending any cookies that could switch us to session auth
        try:
            self.session.cookies.clear()
        except Exception:
            pass

        if 'allow_redirects' not in kwargs:
            kwargs['allow_redirects'] = False

        url = self._build_url(url_or_path)
        response = self.session.request(method, url, headers=merged_headers, **kwargs)
        # Treat redirects to login (or any redirect) as auth failures for API token mode
        if 300 <= response.status_code < 400:
            location = response.headers.get('Location', '')
            raise requests.exceptions.HTTPError(
                f"Unexpected redirect (HTTP {response.status_code}) to '{location}'. Token auth likely rejected.",
                response=response
            )
        return response

    def get(self, url_or_path: str, **kwargs) -> requests.Response:
        return self._request('GET', url_or_path, **kwargs)
        
    def test_connection(self) -> Tuple[bool, str]:
        """
        Test connection to Paperless-ngx instance
        
        Returns:
            (success: bool, message: str)
        """
        try:
            response = self.get('/api/documents/', params={'page_size': 1})
            response.raise_for_status()
            return True, "Connection successful"
        except requests.exceptions.ConnectionError:
            return False, "Cannot connect to Paperless-ngx instance. Check URL and network connectivity."
        except requests.exceptions.Timeout:
            return False, "Connection timeout. Paperless-ngx instance might be slow or unresponsive."
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                return False, "Authentication failed. Check your API token."
            elif e.response.status_code == 403:
                return False, "Access forbidden. Check your API token permissions."
            else:
                return False, f"HTTP error: {e.response.status_code} - {e.response.reason}"
        except Exception as e:
            return False, f"Unexpected error: {str(e)}"
    
    def find_document_by_checksum(self, checksum: str) -> Tuple[bool, Optional[int], str]:

        """

        Find a document by its checksum in Paperless-ngx

        

        Args:

            checksum: Document checksum to search for

            

        Returns:

            (success: bool, document_id: Optional[int], message: str)

        """

        try:

            logger.info(f"Searching for document by checksum: {checksum}")

            

            response = self.get(
                '/api/documents/',
                params={
                    'checksum__iexact': checksum,
                    'ordering': '-created',
                    'page_size': 1
                },
                timeout=15
            )

            

            response.raise_for_status()

            result = response.json()

            

            if 'results' in result and result['results']:

                document = result['results'][0]

                document_id = document.get('id')

                logger.info(f"Found existing document with checksum {checksum}: ID {document_id}")

                return True, document_id, f"Found existing document: ID {document_id}"

            else:

                return False, None, "No document found with matching checksum"

                

        except requests.exceptions.HTTPError as e:

            logger.error(f"HTTP error searching by checksum: {e}")

            return False, None, f"Search failed: HTTP {e.response.status_code}"

        except Exception as e:

            logger.error(f"Error searching by checksum: {e}")

            return False, None, f"Search failed: {str(e)}"

    

    def upload_document(self, file_content: bytes, filename: str, title: Optional[str] = None, 

                       tags: Optional[list] = None, correspondent: Optional[str] = None) -> Tuple[bool, Optional[int], str]:

        # Check for duplicate by checksum before uploading

        checksum = hashlib.md5(file_content).hexdigest()

        success, existing_id, msg = self.find_document_by_checksum(checksum)

        if success:

            return False, existing_id, "The file that is being uploaded to Paperless is a duplicate."

        

        try:
            # Detect MIME type from filename
            import mimetypes
            mime_type, _ = mimetypes.guess_type(filename)
            if not mime_type:
                mime_type = 'application/octet-stream'
            
            # Prepare files for multipart upload
            # Paperless-ngx expects the file under 'document' field
            files = {
                'document': (filename, BytesIO(file_content), mime_type)
            }
            
            # Prepare form data - Paperless-ngx API requirements
            # Note: Don't include 'document' in data, only in files
            data = {}
            if title:
                data['title'] = title
            
            # TODO: For future enhancement, implement proper tag/correspondent handling:
            # - correspondent expects PK (ID) of existing correspondent, not string name
            # - tags expects PKs (IDs) of existing tags, not string names
            # For now, we'll skip these optional fields to get basic upload working
            
            # if correspondent:
            #     # Would need to lookup/create correspondent ID first
            #     data['correspondent'] = correspondent_id
            # if tags:
            #     # Would need to lookup/create tag IDs first
            #     data['tags'] = [tag_id1, tag_id2, ...]
            
            logger.info(f"Uploading document to Paperless-ngx: {filename}")
            logger.info(f"Upload data: {data}")
            logger.info(f"MIME type: {mime_type}")
            
            # Don't set Content-Type manually - let requests handle it
            response = self._request(
                'POST',
                '/api/documents/post_document/',
                files=files,
                data=data,
                timeout=60  # Longer timeout for uploads
            )
            
            logger.info(f"Paperless-ngx upload response status: {response.status_code}")
            logger.info(f"Paperless-ngx upload response text: {response.text[:500]}...")  # First 500 chars
            
            response.raise_for_status()  # This will raise an exception for 4xx/5xx status codes
            
            # Try to parse response as JSON first
            try:
                result = response.json()
                logger.info(f"Paperless-ngx upload response: {result}")
            except Exception as e:
                logger.warning(f"Could not parse response as JSON: {e}")

                # If Paperless returns plain text, it is often just the task UUID.
                text_body = response.text.strip().strip('"')  # paperless may wrap uuid in quotes

                import re
                uuid_pattern = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

                if uuid_pattern.match(text_body):
                    # Treat as task ID and try to resolve the document ID
                    resolved_id = self._get_document_id_from_task(text_body)

                    if resolved_id:
                        return True, resolved_id, "Document uploaded and processed successfully"
                    else:
                        logger.info("Upload accepted; processing asynchronously (task %s)", text_body)
                        return True, None, f"Document uploaded successfully: {text_body}"

                # If we can't recognise the content, still mark success but without ID
                return True, None, "Document uploaded successfully"
            
            # Handle different possible response formats from Paperless-ngx
            document_id = None
            if isinstance(result, dict):
                # JSON object response
                if 'task_id' in result:
                    # Task-based response (asynchronous processing)
                    task_id = result.get('task_id')
                    logger.info(f"Document upload task created: {task_id}")

                    # NEW: Poll Paperless-ngx task endpoint to resolve the final document ID.
                    resolved_id = self._get_document_id_from_task(task_id)

                    if resolved_id:
                        logger.info(f"Resolved task {task_id} to document ID {resolved_id}")
                        return True, resolved_id, "Document uploaded and processed successfully"
                    else:
                        logger.warning(
                            "Timed out waiting for Paperless-ngx to finish processing task %s", task_id
                        )
                        # Processing will still finish in background; caller can attempt later auto-link.
                        return True, None, "Document uploaded (processing asynchronously – link pending)"
                elif 'id' in result:
                    # Direct document ID response (synchronous processing)
                    document_id = result.get('id')
                    logger.info(f"Document uploaded with ID: {document_id}")
                    return True, document_id, "Document uploaded successfully"
                elif result.get('success') or response.status_code == 200:
                    # Generic success response
                    logger.info(f"Document uploaded successfully (generic success)")
                    return True, None, "Document uploaded successfully"
                else:
                    logger.warning(f"Unexpected JSON response format from Paperless-ngx: {result}")
                    # Even if format is unexpected, if we got HTTP 200, it's likely successful
                    return True, None, "Document uploaded successfully (unknown JSON format)"
            elif isinstance(result, str):
                # String response - might contain an ID or just be a success message
                logger.info(f"Document uploaded successfully (string response): {result}")
                # Try to extract an ID from the string if it looks like one
                import re
                # Only match standalone numbers, not task IDs
                id_match = re.search(r'"id"\s*:\s*(\d+)', result)
                if id_match:
                    document_id = int(id_match.group(1))
                    logger.info(f"Extracted document ID from string: {document_id}")
                    return True, document_id, f"Document uploaded successfully: {result}"
                # The string may be a JSON-encoded task UUID (e.g. '"<uuid>"');
                # poll the task endpoint the same way as for plain-text UUIDs.
                uuid_pattern = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
                if uuid_pattern.match(result.strip()):
                    resolved_id = self._get_document_id_from_task(result.strip())
                    if resolved_id:
                        return True, resolved_id, "Document uploaded and processed successfully"
                    logger.info("Upload accepted; processing asynchronously (task %s)", result.strip())
                    return True, None, f"Document uploaded successfully: {result}"
                return True, None, f"Document uploaded successfully: {result}"
            else:
                # Other response type
                logger.warning(f"Unexpected response type from Paperless-ngx: {type(result)} - {result}")
                return True, None, "Document uploaded successfully (unknown response type)"
                
        except requests.exceptions.Timeout:
            return False, None, "Upload timeout. The file might be too large or the connection is slow."
        except requests.exceptions.HTTPError as e:
            error_msg = f"Upload failed: HTTP {e.response.status_code}"
            try:
                error_detail = e.response.json()
                logger.error(f"Paperless-ngx detailed error: {error_detail}")
                
                if 'detail' in error_detail:
                    error_msg += f" - {error_detail['detail']}"
                elif isinstance(error_detail, dict):
                    # Handle field-specific errors
                    error_parts = []
                    for field, errors in error_detail.items():
                        if isinstance(errors, list):
                            error_parts.append(f"{field}: {', '.join(errors)}")
                        else:
                            error_parts.append(f"{field}: {errors}")
                    if error_parts:
                        error_msg += f" - {'; '.join(error_parts)}"
                else:
                    error_msg += f" - {error_detail}"
            except Exception as parse_error:
                logger.error(f"Could not parse error response: {parse_error}")
                error_msg += f" - {e.response.reason}"
            return False, None, error_msg
        except Exception as e:
            logger.error(f"Error uploading document to Paperless-ngx: {e}")
            return False, None, f"Upload failed: {str(e)}"
    
    def get_document_preview(self, document_id: int) -> Tuple[bool, Optional[bytes], str, Optional[str]]:
        """
        Get document preview/content from Paperless-ngx
        
        Args:
            document_id: Paperless-ngx document ID
            
        Returns:
            (success: bool, content: Optional[bytes], message: str, content_type: Optional[str])
        """
        # Try multiple endpoints in order of preference
        endpoints_to_try = [
            ('preview', f'/api/documents/{document_id}/preview/'),
            ('download', f'/api/documents/{document_id}/download/'),
        ]
        
        last_error = None
        
        for endpoint_name, endpoint_path in endpoints_to_try:
            try:
                logger.info(f"Fetching document {endpoint_name} from Paperless-ngx: {document_id}")
                response = self.get(endpoint_path, timeout=30)
                
                response.raise_for_status()
                
                content_type = response.headers.get('Content-Type', 'application/octet-stream')
                logger.info(f"Successfully retrieved document {document_id} via {endpoint_name} endpoint")
                return True, response.content, f"Document retrieved successfully via {endpoint_name}", content_type
                
            except requests.exceptions.HTTPError as e:
                logger.warning(f"Failed to retrieve document {document_id} via {endpoint_name}: HTTP {e.response.status_code}")
                last_error = e
                if e.response.status_code == 404:
                    continue  # Try next endpoint
                else:
                    # For non-404 errors, don't try other endpoints
                    return False, None, f"Failed to retrieve document: HTTP {e.response.status_code}", None
            except Exception as e:
                logger.warning(f"Error retrieving document {document_id} via {endpoint_name}: {e}")
                last_error = e
                continue  # Try next endpoint
        
        # If we get here, all endpoints failed
        if last_error and isinstance(last_error, requests.exceptions.HTTPError) and last_error.response.status_code == 404:
            return False, None, "Document not found in Paperless-ngx", None
        else:
            return False, None, f"Retrieval failed: {str(last_error) if last_error else 'All endpoints failed'}", None
    
    def get_document_thumbnail(self, document_id: int) -> Tuple[bool, Optional[bytes], str]:
        """
        Get document thumbnail from Paperless-ngx
        
        Args:
            document_id: Paperless-ngx document ID
            
        Returns:
            (success: bool, content: Optional[bytes], message: str)
        """
        try:
            response = self.get(f'/api/documents/{document_id}/thumb/', timeout=15)
            
            response.raise_for_status()
            return True, response.content, "Thumbnail retrieved successfully"
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return False, None, "Document or thumbnail not found"
            else:
                return False, None, f"Failed to retrieve thumbnail: HTTP {e.response.status_code}"
        except Exception as e:
            logger.error(f"Error retrieving thumbnail from Paperless-ngx: {e}")
            return False, None, f"Thumbnail retrieval failed: {str(e)}"
    
    def search_documents(self, query: str, limit: int = 25) -> Tuple[bool, Optional[list], str]:
        """
        Search documents in Paperless-ngx
        
        Args:
            query: Search query string
            limit: Maximum number of results to return
            
        Returns:
            (success: bool, documents: Optional[list], message: str)
        """
        try:
            params = {
                'query': query,
                'page_size': min(limit, 100)  # Cap at 100 for performance
            }
            
            response = self.get('/api/documents/', params=params, timeout=15)
            
            response.raise_for_status()
            result = response.json()
            
            documents = result.get('results', [])
            return True, documents, f"Found {len(documents)} documents"
            
        except Exception as e:
            logger.error(f"Error searching documents in Paperless-ngx: {e}")
            return False, None, f"Search failed: {str(e)}"
    
    def get_document_info(self, document_id: int) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Get document information from Paperless-ngx
        
        Args:
            document_id: Paperless-ngx document ID
            
        Returns:
            (success: bool, document_info: Optional[Dict], message: str)
        """
        try:
            response = self.get(f'/api/documents/{document_id}/', timeout=15)
            
            response.raise_for_status()
            document_info = response.json()
            
            return True, document_info, "Document info retrieved successfully"
            
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return False, None, "Document not found"
            else:
                return False, None, f"Failed to retrieve document info: HTTP {e.response.status_code}"
        except Exception as e:
            logger.error(f"Error retrieving document info from Paperless-ngx: {e}")
            return False, None, f"Info retrieval failed: {str(e)}"

    def debug_document_status(self, document_id: int) -> Dict[str, Any]:
        """
        Debug method to check document status and available endpoints
        
        Args:
            document_id: Paperless-ngx document ID
            
        Returns:
            Dictionary with debug information
        """
        debug_info = {
            'document_id': document_id,
            'endpoints_tested': {},
            'document_exists': False,
            'document_info': None
        }
        
        # Test different endpoints
        endpoints_to_test = [
            ('info', f'/api/documents/{document_id}/'),
            ('preview', f'/api/documents/{document_id}/preview/'),
            ('download', f'/api/documents/{document_id}/download/'),
            ('thumb', f'/api/documents/{document_id}/thumb/')
        ]
        
        for endpoint_name, endpoint_path in endpoints_to_test:
            try:
                logger.info(f"Testing endpoint: {self.paperless_url}{endpoint_path}")
                response = self.get(endpoint_path, timeout=15)
                
                debug_info['endpoints_tested'][endpoint_name] = {
                    'status_code': response.status_code,
                    'success': response.status_code < 400,
                    'content_type': response.headers.get('Content-Type', 'unknown'),
                    'content_length': len(response.content) if response.content else 0
                }
                
                if endpoint_name == 'info' and response.status_code == 200:
                    debug_info['document_exists'] = True
                    try:
                        debug_info['document_info'] = response.json()
                    except:
                        debug_info['document_info'] = 'Could not parse JSON'
                        
            except Exception as e:
                debug_info['endpoints_tested'][endpoint_name] = {
                    'error': str(e),
                    'success': False
                }
        
        # Also try to list recent documents to see if our document is there
        try:
            response = self.get('/api/documents/', params={'ordering': '-created', 'page_size': 10}, timeout=15)
            if response.status_code == 200:
                recent_docs = response.json().get('results', [])
                debug_info['recent_documents'] = [
                    {'id': doc.get('id'), 'title': doc.get('title'), 'created': doc.get('created')}
                    for doc in recent_docs
                ]
                debug_info['document_in_recent'] = any(doc.get('id') == document_id for doc in recent_docs)
            else:
                debug_info['recent_documents'] = f'Error: {response.status_code}'
        except Exception as e:
            debug_info['recent_documents'] = f'Exception: {str(e)}'
        
        return debug_info

    def document_exists(self, document_id: int) -> bool:
        """
        Check if a document exists in Paperless-ngx
        
        Args:
            document_id: Paperless-ngx document ID
            
        Returns:
            True if document exists, False otherwise
        """
        try:
            response = self.get(f'/api/documents/{document_id}/', timeout=10)
            return response.status_code == 200
        except Exception as e:
            logger.warning(f"Error checking document existence {document_id}: {e}")
            return False

    def find_document_by_title(self, title: str) -> Tuple[bool, Optional[int], str]:
        """
        Find a document by its title in Paperless-ngx
        
        Args:
            title: Document title to search for
            
        Returns:
            (success: bool, document_id: Optional[int], message: str)
        """
        try:
            logger.info(f"Searching for document by title: {title}")
            
            # Search for documents with the given title
            response = self.get(
                '/api/documents/',
                params={
                    'title__icontains': title,  # Case-insensitive partial match
                    'ordering': '-created',     # Most recent first
                    'page_size': 10            # Limit results
                },
                timeout=15
            )
            
            response.raise_for_status()
            result = response.json()
            
            if 'results' in result and result['results']:
                # Return the first (most recent) match
                document = result['results'][0]
                document_id = document.get('id')
                document_title = document.get('title', 'Unknown')
                
                logger.info(f"Found document: ID {document_id}, Title: {document_title}")
                return True, document_id, f"Found document: {document_title}"
            else:
                logger.info(f"No document found with title containing: {title}")
                return False, None, "Document not found"
                
        except requests.exceptions.HTTPError as e:
            logger.error(f"HTTP error searching for document: {e}")
            return False, None, f"Search failed: HTTP {e.response.status_code}"
        except Exception as e:
            logger.error(f"Error searching for document: {e}")
            return False, None, f"Search failed: {str(e)}"

    # ---------------------------------------------------------------------
    # Internal helpers
    # ---------------------------------------------------------------------

    def _get_document_id_from_task(
        self,
        task_id: str,
        timeout_secs: int = 600,  # increased to 10 minutes per user request
        poll_interval: float = 5.0,  # less frequent polling to reduce load
    ) -> Optional[int]:
        """Poll /api/tasks endpoint until the task completes and returns a document ID.

        Args:
            task_id: The UUID returned by the document upload request.
            timeout_secs: Maximum time to wait before giving up.
            poll_interval: Seconds between polls.

        Returns:
            The related document ID if the task completed successfully within the
            timeout window; otherwise, ``None``.
        """

        import time

        if not task_id:
            return None

        # Prefer the dedicated task endpoint (Paperless ≥2.3). Some older
        # releases only support the list + filter variant. We therefore try the
        # singular endpoint first and fall back to the legacy query if it 404s.

        task_url_primary = f"{self.paperless_url}/api/tasks/{task_id}/"
        task_url_legacy_list = f"{self.paperless_url}/api/tasks/"

        deadline = time.time() + timeout_secs

        while time.time() < deadline:
            try:
                try:
                    resp = self.get(task_url_primary, timeout=10)
                    if resp.status_code == 404:
                        # Fall back to legacy ?task_id=<uuid> filter
                        resp = self.get(task_url_legacy_list, params={"task_id": task_id}, timeout=10)
                except requests.exceptions.HTTPError as http_err:
                    if http_err.response.status_code == 404 and http_err.response.url.rstrip('/') == task_url_primary.rstrip('/'):
                        # Primary endpoint not available, try legacy
                        resp = self.get(task_url_legacy_list, params={"task_id": task_id}, timeout=10)
                    else:
                        raise

                resp.raise_for_status()

                # Legacy endpoint returns a list
                if isinstance(resp.json(), list):
                    task_info = resp.json()[0] if resp.json() else {}
                else:
                    task_info = resp.json()

                # In newer Paperless versions the field is called "state"; fall back to
                # "status" for backwards-compatibility.
                state = task_info.get("state") or task_info.get("status")
                related_doc = task_info.get("related_document")

                # Some Paperless versions don't fill related_document but embed the
                # newly-created ID in the free-text "result" string, e.g.
                #   "Success. New document id 416 created"  – see GH#3064.
                if not related_doc and isinstance(task_info.get("result"), str):
                    import re
                    m = re.search(r"document id (\d+)", task_info["result"])
                    if m:
                        related_doc = m.group(1)

                if state == "SUCCESS" and related_doc:
                    try:
                        return int(related_doc)
                    except (ValueError, TypeError):
                        logger.warning("Unexpected related_document value: %s", related_doc)
                        return None

                if state in {"FAILURE", "REVOKED"}:
                    logger.error("Paperless task %s finished with state %s", task_id, state)
                    return None

                # Task still running – wait and try again
                time.sleep(poll_interval)

            except Exception as poll_err:
                # Transient network or parsing error – log and retry until deadline
                logger.warning("Error polling task %s: %s", task_id, poll_err)
                time.sleep(poll_interval)

        # Timed out waiting for the task to finish
        logger.warning(
            "Timed out after %s seconds waiting for task %s (state pending) – will return None so frontend can attempt auto-link",
            timeout_secs,
            task_id,
        )
        return None


def get_paperless_handler(conn) -> Optional[PaperlessHandler]:
    """
    Get a configured Paperless handler from site settings
    
    Args:
        conn: Database connection
        
    Returns:
        PaperlessHandler instance or None if not configured/enabled
    """
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT key, value FROM site_settings 
                WHERE key IN ('paperless_enabled', 'paperless_url', 'paperless_api_token')
            """)
            settings = {row[0]: row[1] for row in cur.fetchall()}
            
            # Check if Paperless-ngx is enabled
            if settings.get('paperless_enabled', 'false').lower() != 'true':
                return None
            
            # Check required settings
            paperless_url = settings.get('paperless_url', '').strip()
            paperless_token = settings.get('paperless_api_token', '').strip()
            
            if not paperless_url or not paperless_token:
                logger.warning("Paperless-ngx is enabled but URL or API token is missing")
                return None
            
            return PaperlessHandler(paperless_url, paperless_token)
            
    except Exception as e:
        logger.error(f"Error creating Paperless handler: {e}")
        return None 
