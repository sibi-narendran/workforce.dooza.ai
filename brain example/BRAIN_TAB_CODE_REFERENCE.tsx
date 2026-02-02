/**
 * =============================================================================
 * BRAIN TAB - COMPLETE CODE REFERENCE (FRONTEND + BACKEND)
 * =============================================================================
 *
 * This file contains ALL code for the Brain tab UI and functionality.
 * Copy the sections you need.
 *
 * Contents:
 *
 * FRONTEND:
 * 1. API Types & Functions (from lib/api.ts)
 * 2. Main Page Component (KnowledgeBasePage.tsx)
 * 3. Brand Identity Tab (BrandIdentityTab.tsx) - main form
 * 4. Memory Tab (MemoryTab.tsx) - placeholder
 *
 * BACKEND:
 * 5. Knowledge Router (routers/knowledge.py) - API endpoints
 * 6. Brand Extractor Service (services/brand_extractor.py) - web scraping + LLM
 * 7. Knowledge Service (services/knowledge_service.py) - database operations
 *
 * =============================================================================
 */


// =============================================================================
// SECTION 1: FRONTEND - API TYPES & FUNCTIONS (from lib/api.ts)
// =============================================================================

/**
 * Brand settings for an organization.
 * Controls brand voice, colors, and company information used by AI agents.
 */
export interface BrandSettings {
  id: string
  org_id: string
  business_name: string | null
  website: string | null
  tagline: string | null
  brand_voice: string | null
  colors: { primary?: string; secondary?: string; tertiary?: string }
  fonts: { heading?: string; body?: string }
  description: string | null
  value_proposition: string | null
  industry: string | null
  target_audience: string | null
  created_at: string | null
  updated_at: string | null
}

/**
 * Brand asset (logo, image, video, document).
 * Stored in Supabase Storage, referenced by file_path.
 */
export interface BrandAsset {
  id: string
  org_id: string
  asset_type: 'logo' | 'image' | 'video' | 'document' | 'font'
  name: string
  description: string | null
  file_path: string
  public_url: string | null
  file_size: number | null
  mime_type: string | null
  metadata: Record<string, unknown>
  usage_count: number
  created_at: string | null
}

/**
 * Extract brand response from URL extraction API.
 */
export interface BrandExtractResponse {
  success: boolean
  url: string
  extracted: {
    business_name: string | null
    website: string | null
    tagline: string | null
    colors: { primary?: string; secondary?: string } | null
    fonts: { heading?: string; body?: string } | null
    social_links: Record<string, string> | null
    description: string | null
    value_proposition: string | null
    target_audience: string | null
    industry: string | null
  }
  logo: {
    found: boolean
    saved: boolean
    url: string | null
  }
  settings_saved: boolean
  error: string | null
}

// API Functions
export async function getBrandSettings(): Promise<BrandSettings> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/v1/knowledge/brand`, { headers })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch brand settings' }))
    throw new Error(error.detail || 'Failed to fetch brand settings')
  }

  return response.json()
}

export async function updateBrandSettings(
  settings: Partial<Omit<BrandSettings, 'id' | 'org_id' | 'created_at' | 'updated_at'>>
): Promise<BrandSettings> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/v1/knowledge/brand`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(settings)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update brand settings' }))
    throw new Error(error.detail || 'Failed to update brand settings')
  }

  return response.json()
}

export async function getBrandAssets(assetType?: string): Promise<BrandAsset[]> {
  const headers = await getAuthHeaders()
  const params = new URLSearchParams()
  if (assetType) params.set('asset_type', assetType)

  const url = `${API_BASE}/v1/knowledge/assets${params.toString() ? '?' + params : ''}`
  const response = await fetch(url, { headers })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch brand assets' }))
    throw new Error(error.detail || 'Failed to fetch brand assets')
  }

  return response.json()
}

export async function createBrandAsset(asset: {
  asset_type: 'logo' | 'image' | 'video' | 'document' | 'font'
  name: string
  file_path: string
  description?: string
  public_url?: string
  file_size?: number
  mime_type?: string
  metadata?: Record<string, unknown>
}): Promise<BrandAsset> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/v1/knowledge/assets`, {
    method: 'POST',
    headers,
    body: JSON.stringify(asset)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create brand asset' }))
    throw new Error(error.detail || 'Failed to create brand asset')
  }

  return response.json()
}

export async function deleteBrandAsset(assetId: string): Promise<void> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/v1/knowledge/assets/${assetId}`, {
    method: 'DELETE',
    headers
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete brand asset' }))
    throw new Error(error.detail || 'Failed to delete brand asset')
  }
}

export async function getBrandContext(): Promise<{
  settings: BrandSettings | null
  logo_url: string | null
  recent_images: BrandAsset[]
  prompt_context: string
}> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/v1/knowledge/context`, { headers })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch brand context' }))
    throw new Error(error.detail || 'Failed to fetch brand context')
  }

  return response.json()
}

export async function extractBrandFromUrl(url: string): Promise<BrandExtractResponse> {
  const headers = await getAuthHeaders()
  const response = await fetch(`${API_BASE}/v1/knowledge/brand/extract`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url })
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to extract brand data' }))
    throw new Error(error.detail || 'Failed to extract brand data')
  }

  return response.json()
}


// =============================================================================
// SECTION 2: FRONTEND - MAIN PAGE COMPONENT (KnowledgeBasePage.tsx)
// =============================================================================

/**
 * KnowledgeBasePage (Brain)
 *
 * Main brain/knowledge page with tabbed interface.
 * Follows the codebase pattern: lean page component that orchestrates layout
 * and imports specialized tab components from components/knowledge/.
 */

import { useState } from 'react'
import { Brain, Palette, Cpu } from 'lucide-react'
import { BrandIdentityTab, MemoryTab } from '../components/knowledge'

type TabKey = 'brand' | 'memory'

export default function KnowledgeBasePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('brand')

  return (
    <div className="page-scrollable" style={{
      background: 'var(--gray-50)',
      padding: '32px 40px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', maxWidth: '1100px', margin: '0 auto 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, var(--primary-500), var(--primary-600))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)',
          }}>
            <Brain size={24} color="white" />
          </div>
          <div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: '700',
              color: 'var(--gray-900)',
              margin: 0,
              letterSpacing: '-0.02em'
            }}>
              Brain
            </h1>
            <p style={{
              fontSize: '15px',
              color: 'var(--gray-500)',
              margin: '4px 0 0 0',
            }}>
              Configure your brand identity and AI memory
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: '1100px', margin: '0 auto 28px' }}>
        <div style={{
          display: 'inline-flex',
          background: 'white',
          padding: '4px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <TabButton
            active={activeTab === 'brand'}
            onClick={() => setActiveTab('brand')}
            icon={<Palette size={16} />}
            label="Brand Identity"
          />
          <TabButton
            active={activeTab === 'memory'}
            onClick={() => setActiveTab('memory')}
            icon={<Cpu size={16} />}
            label="Memory"
          />
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {activeTab === 'brand' && <BrandIdentityTab />}
        {activeTab === 'memory' && <MemoryTab />}
      </div>

      {/* Global animation styles */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// Tab Button Sub-component
interface TabButtonProps {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 20px',
        background: active
          ? 'linear-gradient(135deg, var(--primary-500), var(--primary-600))'
          : 'transparent',
        color: active ? 'white' : 'var(--gray-500)',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {icon}
      {label}
    </button>
  )
}


// =============================================================================
// SECTION 3: FRONTEND - BRAND IDENTITY TAB (BrandIdentityTab.tsx)
// =============================================================================
// This section is ~700 lines - see the original file for full implementation
// Key features: auto-save, logo upload, media library, website extraction


// =============================================================================
// SECTION 4: FRONTEND - MEMORY TAB (MemoryTab.tsx)
// =============================================================================

/**
 * MemoryTab - Coming soon placeholder for AI Memory feature.
 */

import { Cpu, Clock } from 'lucide-react'

export default function MemoryTab() {
  return (
    <div style={{
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.04)',
      padding: '80px 40px',
      textAlign: 'center',
    }}>
      <div style={{
        width: '80px',
        height: '80px',
        borderRadius: '20px',
        background: 'var(--primary-100)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '0 auto 24px',
      }}>
        <Cpu size={40} style={{ color: 'var(--primary-600)' }} />
      </div>

      <h2 style={{
        fontSize: '24px',
        fontWeight: '700',
        color: 'var(--gray-900)',
        margin: '0 0 12px 0',
        letterSpacing: '-0.02em'
      }}>
        AI Memory
      </h2>

      <p style={{
        fontSize: '16px',
        color: 'var(--gray-500)',
        margin: '0 0 24px 0',
        maxWidth: '400px',
        marginLeft: 'auto',
        marginRight: 'auto',
        lineHeight: '1.6',
      }}>
        Train your AI agents with custom knowledge, documents, and context to generate even more personalized content.
      </p>

      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 24px',
        background: 'var(--primary-50)',
        border: '1px solid var(--primary-200)',
        borderRadius: '100px',
        color: 'var(--primary-700)',
        fontWeight: '600',
        fontSize: '14px',
      }}>
        <Clock size={18} />
        Coming Soon
      </div>
    </div>
  )
}


/* =============================================================================
 * =============================================================================
 * BACKEND CODE (PYTHON)
 * =============================================================================
 * =============================================================================
 */


// =============================================================================
// SECTION 5: BACKEND - KNOWLEDGE ROUTER (routers/knowledge.py)
// =============================================================================

/*
"""
Knowledge Router - Brand settings, assets, and knowledge base API.

All endpoints are org-scoped. Users access their organization's data
through their membership (resolved from user_id → org_id).

Endpoints:
- GET/PUT /brand - Brand settings (colors, voice, description, etc.)
- GET/POST/DELETE /assets - Media library (logos, images, videos)
- GET /context - Combined brand context for agents
- POST /brand/extract - Extract brand from URL (web scraping + LLM)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.services.knowledge_service import (
    get_knowledge_service,
    BrandSettings,
    BrandAsset,
    BrandContext,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# Request/Response Models
# =============================================================================

class BrandSettingsUpdate(BaseModel):
    """Request to update brand settings."""
    business_name: Optional[str] = None
    website: Optional[str] = None
    tagline: Optional[str] = None
    brand_voice: Optional[str] = None
    colors: Optional[dict] = Field(None, description="{ primary, secondary, tertiary }")
    fonts: Optional[dict] = Field(None, description="{ heading, body }")
    social_links: Optional[dict] = Field(None, description="{ twitter, linkedin, instagram, facebook, youtube, ... }")
    description: Optional[str] = None
    value_proposition: Optional[str] = None
    industry: Optional[str] = None
    target_audience: Optional[str] = None


class BrandSettingsResponse(BaseModel):
    """Brand settings response."""
    id: str
    org_id: str
    business_name: Optional[str] = None
    website: Optional[str] = None
    tagline: Optional[str] = None
    brand_voice: Optional[str] = None
    colors: dict = {}
    fonts: dict = {}
    social_links: dict = {}
    description: Optional[str] = None
    value_proposition: Optional[str] = None
    industry: Optional[str] = None
    target_audience: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class BrandExtractRequest(BaseModel):
    """Request to extract brand data from URL."""
    url: str = Field(..., description="Company website URL to extract brand data from")


class BrandExtractResponse(BaseModel):
    """Response from brand extraction."""
    success: bool
    url: str
    extracted: dict = {}
    logo: dict = {}
    settings_saved: bool = False
    error: Optional[str] = None


class BrandAssetResponse(BaseModel):
    """Brand asset response."""
    id: str
    org_id: str
    asset_type: str
    name: str
    description: Optional[str] = None
    file_path: str
    public_url: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    metadata: dict = {}
    usage_count: int = 0
    created_at: Optional[str] = None


class BrandAssetCreate(BaseModel):
    """Request to create a brand asset record."""
    asset_type: str = Field(..., description="logo, image, video, document, font")
    name: str
    description: Optional[str] = None
    file_path: str
    public_url: Optional[str] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    metadata: Optional[dict] = None


class BrandContextResponse(BaseModel):
    """Complete brand context for agents."""
    settings: Optional[BrandSettingsResponse] = None
    logo_url: Optional[str] = None
    recent_images: list[BrandAssetResponse] = []
    prompt_context: str = ""


# =============================================================================
# Helper Functions
# =============================================================================

def settings_to_response(settings: BrandSettings) -> BrandSettingsResponse:
    """Convert BrandSettings to response model."""
    return BrandSettingsResponse(
        id=settings.id,
        org_id=settings.org_id,
        business_name=settings.business_name,
        website=settings.website,
        tagline=settings.tagline,
        brand_voice=settings.brand_voice,
        colors=settings.colors,
        fonts=settings.fonts,
        social_links=settings.social_links,
        description=settings.description,
        value_proposition=settings.value_proposition,
        industry=settings.industry,
        target_audience=settings.target_audience,
        created_at=settings.created_at,
        updated_at=settings.updated_at,
    )


def asset_to_response(asset: BrandAsset) -> BrandAssetResponse:
    """Convert BrandAsset to response model."""
    return BrandAssetResponse(
        id=asset.id,
        org_id=asset.org_id,
        asset_type=asset.asset_type,
        name=asset.name,
        description=asset.description,
        file_path=asset.file_path,
        public_url=asset.public_url,
        file_size=asset.file_size,
        mime_type=asset.mime_type,
        metadata=asset.metadata,
        usage_count=asset.usage_count,
        created_at=asset.created_at,
    )


# =============================================================================
# Brand Settings Endpoints
# =============================================================================

@router.get("/brand", response_model=BrandSettingsResponse)
async def get_brand_settings(
    user_id: str = Depends(get_current_user),
):
    """
    Get brand settings for the user's organization.
    Returns empty settings with org_id if not configured yet.
    """
    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    settings = await service.get_brand_settings(org_id)

    if not settings:
        return BrandSettingsResponse(id="", org_id=org_id)

    return settings_to_response(settings)


@router.put("/brand", response_model=BrandSettingsResponse)
async def update_brand_settings(
    update: BrandSettingsUpdate,
    user_id: str = Depends(get_current_user),
):
    """
    Update brand settings for the user's organization.
    Uses UPSERT - creates settings if they don't exist.
    Only provided fields are updated.
    """
    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    settings = await service.save_brand_settings(
        org_id,
        business_name=update.business_name,
        website=update.website,
        tagline=update.tagline,
        brand_voice=update.brand_voice,
        colors=update.colors,
        fonts=update.fonts,
        social_links=update.social_links,
        description=update.description,
        value_proposition=update.value_proposition,
        industry=update.industry,
        target_audience=update.target_audience,
        created_by=user_id,
    )

    if not settings:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save brand settings",
        )

    logger.info(f"Updated brand settings for org {org_id}")
    return settings_to_response(settings)


@router.post("/brand/extract", response_model=BrandExtractResponse)
async def extract_brand_from_url(
    request: BrandExtractRequest,
    user_id: str = Depends(get_current_user),
):
    """
    Extract brand information from a company URL.

    This endpoint:
    1. Fetches the website HTML
    2. Extracts reliable data (meta tags, favicon, social links, colors, fonts)
    3. Uses LLM to analyze page text for semantic fields (description, value prop, etc.)
    4. Saves everything directly to brand_settings

    The data is saved immediately. User can edit via PUT /brand endpoint later.
    """
    from app.services.brand_extractor import extract_and_save_brand

    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    try:
        result = await extract_and_save_brand(
            url=request.url,
            org_id=org_id,
            user_id=user_id,
        )

        logger.info(f"Extracted brand from {request.url} for org {org_id}")

        return BrandExtractResponse(
            success=result["success"],
            url=result["url"],
            extracted=result["extracted"],
            logo=result["logo"],
            settings_saved=result["settings_saved"],
        )

    except ValueError as e:
        logger.warning(f"Brand extraction failed for {request.url}: {e}")
        return BrandExtractResponse(
            success=False,
            url=request.url,
            error=str(e),
        )
    except Exception as e:
        logger.error(f"Brand extraction error for {request.url}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extraction failed: {str(e)}",
        )


# =============================================================================
# Brand Assets Endpoints
# =============================================================================

@router.get("/assets", response_model=list[BrandAssetResponse])
async def list_brand_assets(
    asset_type: Optional[str] = Query(None, description="Filter by type: logo, image, video, document, font"),
    limit: int = Query(50, le=100),
    user_id: str = Depends(get_current_user),
):
    """List brand assets for the user's organization."""
    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    assets = await service.get_brand_assets(org_id, asset_type=asset_type, limit=limit)
    return [asset_to_response(a) for a in assets]


@router.post("/assets", response_model=BrandAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_brand_asset(
    asset: BrandAssetCreate,
    user_id: str = Depends(get_current_user),
):
    """
    Create a brand asset record.
    Note: File upload should be done separately via Supabase Storage.
    """
    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    valid_types = ["logo", "image", "video", "document", "font"]
    if asset.asset_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid asset_type. Must be one of: {valid_types}",
        )

    saved = await service.save_brand_asset(
        org_id,
        asset_type=asset.asset_type,
        name=asset.name,
        file_path=asset.file_path,
        description=asset.description,
        public_url=asset.public_url,
        file_size=asset.file_size,
        mime_type=asset.mime_type,
        metadata=asset.metadata,
        uploaded_by=user_id,
    )

    if not saved:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save brand asset",
        )

    logger.info(f"Created brand asset '{asset.name}' for org {org_id}")
    return asset_to_response(saved)


@router.delete("/assets/{asset_id}")
async def delete_brand_asset(
    asset_id: str,
    user_id: str = Depends(get_current_user),
):
    """Delete a brand asset (soft delete)."""
    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    deleted = await service.delete_brand_asset(org_id, asset_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Asset not found or already deleted",
        )

    logger.info(f"Deleted brand asset {asset_id} for org {org_id}")
    return {"status": "deleted", "asset_id": asset_id}


# =============================================================================
# Brand Context Endpoint (For Agents)
# =============================================================================

@router.get("/context", response_model=BrandContextResponse)
async def get_brand_context(
    user_id: str = Depends(get_current_user),
):
    """
    Get complete brand context for content creation.
    Used by agents to get brand voice, colors, logo, and recent images.
    """
    service = get_knowledge_service()

    context = await service.get_brand_context(user_id)

    response = BrandContextResponse(
        logo_url=context.logo_url,
        recent_images=[asset_to_response(a) for a in context.recent_images],
        prompt_context=context.to_prompt_context(),
    )

    if context.settings:
        response.settings = settings_to_response(context.settings)

    return response


# =============================================================================
# Knowledge Search Endpoint
# =============================================================================

@router.get("/search")
async def search_knowledge(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(5, le=20),
    user_id: str = Depends(get_current_user),
):
    """Search knowledge base documents."""
    service = get_knowledge_service()

    org_id = await service.get_user_org_id(user_id)
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No organization found for user",
        )

    results = await service.search_knowledge(org_id, q, limit=limit)
    return {"results": results, "count": len(results)}
*/


// =============================================================================
// SECTION 6: BACKEND - BRAND EXTRACTOR SERVICE (services/brand_extractor.py)
// =============================================================================
// This is the main web scraping + LLM analysis code

/*
"""
Brand Extractor Service

Extracts brand information from company URLs using:
1. Reliable HTML parsing (meta tags, favicon, social links)
2. LLM analysis of page text (description, value prop, audience, industry)

Production-ready with:
- Graceful degradation (saves what we can extract)
- Proper error handling and logging
- Timeout handling for HTTP requests
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel, Field as PydanticField

from app.agents.base import get_llm
from app.core.database import get_supabase_client
from app.services.knowledge_service import get_knowledge_service

logger = logging.getLogger(__name__)


# =============================================================================
# HTTP UTILITIES
# =============================================================================

DEFAULT_TIMEOUT = 30.0
MAX_RESPONSE_SIZE = 10 * 1024 * 1024  # 10MB
USER_AGENT = 'Mozilla/5.0 (compatible; DoozaBot/1.0; +https://dooza.ai)'


async def fetch_url(url: str, timeout: float = DEFAULT_TIMEOUT) -> Tuple[str, int]:
    """Fetch URL content with proper error handling."""
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url

    headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }

    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=timeout,
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
    ) as client:
        response = await client.get(url, headers=headers)

        content_length = response.headers.get('content-length')
        if content_length and int(content_length) > MAX_RESPONSE_SIZE:
            raise ValueError(f"Response too large: {content_length} bytes")

        return response.text, response.status_code


def parse_html(html: str) -> BeautifulSoup:
    """Parse HTML content with BeautifulSoup."""
    return BeautifulSoup(html, 'html.parser')


def extract_text_content(soup: BeautifulSoup) -> str:
    """Extract clean text content from parsed HTML."""
    for element in soup(['script', 'style', 'noscript', 'header', 'footer', 'nav']):
        element.decompose()
    text = soup.get_text(separator=' ', strip=True)
    text = re.sub(r'\s+', ' ', text)
    return text


# =============================================================================
# CONSTANTS
# =============================================================================

SOCIAL_PATTERNS = {
    "twitter": r"(?:twitter\.com|x\.com)/",
    "linkedin": r"linkedin\.com/(?:company|in)/",
    "instagram": r"instagram\.com/",
    "facebook": r"facebook\.com/",
    "youtube": r"youtube\.com/(?:@|channel|c/|user/)",
    "tiktok": r"tiktok\.com/@",
    "github": r"github\.com/",
    "pinterest": r"pinterest\.com/",
}

MAX_TEXT_FOR_LLM = 4000


# =============================================================================
# RELIABLE EXTRACTION (HTML Parsing)
# =============================================================================

def extract_company_name(soup: BeautifulSoup, url: str = "") -> Optional[str]:
    """
    Extract company name from reliable sources.
    Priority: og:site_name > schema.org > domain name > title tag
    """
    og_site = soup.find("meta", property="og:site_name")
    if og_site and og_site.get("content"):
        name = og_site["content"].strip()
        if len(name) < 50 and "|" not in name and "-" not in name:
            return name

    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict):
                if data.get("@type") == "Organization" and data.get("name"):
                    return data["name"]
                if isinstance(data.get("publisher"), dict):
                    if data["publisher"].get("name"):
                        return data["publisher"]["name"]
        except (json.JSONDecodeError, TypeError):
            continue

    if url:
        domain_name = extract_domain_name(url)
        if domain_name and len(domain_name) > 2:
            return domain_name

    title_tag = soup.find("title")
    if title_tag:
        title = title_tag.get_text(strip=True)
        parts = re.split(r"\s*[|\-–—:]\s*", title)
        for part in parts:
            part = part.strip()
            if len(part) > 40:
                continue
            tagline_words = ["that", "your", "the", "for", "with", "and", "our", "best", "top", "free"]
            if any(word in part.lower().split() for word in tagline_words):
                continue
            if part and len(part) < 40:
                return part
        if parts:
            shortest = min(parts, key=len)
            if shortest and len(shortest) < 50:
                return shortest.strip()

    return None


def extract_tagline(soup: BeautifulSoup) -> Optional[str]:
    """Extract tagline/slogan from meta description or og:title."""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        content = og_title["content"].strip()
        if len(content) < 150:
            return content

    meta_desc = soup.find("meta", attrs={"name": "description"})
    if meta_desc and meta_desc.get("content"):
        content = meta_desc["content"].strip()
        if len(content) < 100:
            return content

    return None


def extract_logo_url(soup: BeautifulSoup, base_url: str) -> Optional[str]:
    """
    Extract logo URL from reliable sources.
    Priority: schema.org > apple-touch-icon > large favicon > og:image
    """
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
            if isinstance(data, dict):
                logo = data.get("logo")
                if isinstance(logo, str):
                    return urljoin(base_url, logo)
                if isinstance(logo, dict) and logo.get("url"):
                    return urljoin(base_url, logo["url"])
        except (json.JSONDecodeError, TypeError):
            continue

    apple_icon = soup.find("link", rel=lambda x: x and "apple-touch-icon" in x)
    if apple_icon and apple_icon.get("href"):
        return urljoin(base_url, apple_icon["href"])

    for link in soup.find_all("link", rel=lambda x: x and "icon" in str(x).lower()):
        href = link.get("href")
        sizes = link.get("sizes", "")
        if href:
            if "192" in sizes or "180" in sizes or "152" in sizes or "144" in sizes:
                return urljoin(base_url, href)

    favicon = soup.find("link", rel="icon") or soup.find("link", rel="shortcut icon")
    if favicon and favicon.get("href"):
        return urljoin(base_url, favicon["href"])

    og_image = soup.find("meta", property="og:image")
    if og_image and og_image.get("content"):
        return og_image["content"]

    return urljoin(base_url, "/favicon.ico")


def extract_social_links(soup: BeautifulSoup) -> dict[str, str]:
    """Extract social media links by matching URL patterns."""
    social_links = {}

    for link in soup.find_all("a", href=True):
        href = link["href"]

        for platform, pattern in SOCIAL_PATTERNS.items():
            if platform not in social_links and re.search(pattern, href, re.I):
                if href.startswith("//"):
                    href = "https:" + href
                elif not href.startswith("http"):
                    continue
                social_links[platform] = href
                break

    return social_links


def extract_colors_from_css(soup: BeautifulSoup) -> dict[str, str]:
    """Extract brand colors from CSS variables in style tags."""
    colors = {}
    color_mapping = {
        "primary": ["--primary", "--primary-color", "--brand", "--brand-color", "--main", "--main-color"],
        "secondary": ["--secondary", "--secondary-color", "--accent", "--accent-color"],
    }

    for style in soup.find_all("style"):
        css_text = style.string or ""

        for color_key, var_names in color_mapping.items():
            if color_key in colors:
                continue
            for var_name in var_names:
                pattern = rf"{re.escape(var_name)}\s*:\s*(#[0-9a-fA-F]{{3,8}}|rgb[a]?\([^)]+\))"
                match = re.search(pattern, css_text, re.I)
                if match:
                    colors[color_key] = match.group(1)
                    break

    return colors


def extract_fonts(soup: BeautifulSoup) -> dict[str, str]:
    """Extract font information from Google Fonts links."""
    fonts = {}

    for link in soup.find_all("link", href=True):
        href = link["href"]
        if "fonts.googleapis.com" in href or "fonts.gstatic.com" in href:
            match = re.search(r"family=([^:&]+)", href)
            if match:
                font_name = match.group(1).replace("+", " ")
                if "heading" not in fonts:
                    fonts["heading"] = font_name
                elif "body" not in fonts:
                    fonts["body"] = font_name

    return fonts


def extract_domain_name(url: str) -> str:
    """Extract clean domain name as fallback for company name."""
    parsed = urlparse(url)
    domain = parsed.netloc or parsed.path
    domain = re.sub(r"^www\.", "", domain)
    domain = re.sub(r"\.(com|io|ai|co|org|net|app|dev)$", "", domain, flags=re.I)
    name = domain.replace("-", " ").replace("_", " ")
    return name.title()


# =============================================================================
# LLM ANALYSIS
# =============================================================================

class BrandAnalysis(BaseModel):
    """Structured output for brand analysis from LLM."""
    description: Optional[str] = PydanticField(
        None,
        description="2-3 sentence summary of what this company does"
    )
    value_proposition: Optional[str] = PydanticField(
        None,
        description="What makes them unique or different (1-2 sentences)"
    )
    target_audience: Optional[str] = PydanticField(
        None,
        description="Who are their ideal customers"
    )
    industry: Optional[str] = PydanticField(
        None,
        description="Primary industry category (e.g., AI/SaaS, Healthcare, E-commerce)"
    )


async def analyze_with_llm(page_text: str, company_name: Optional[str] = None) -> dict[str, Optional[str]]:
    """
    Use LLM with structured output to extract semantic fields from page text.
    Uses Pydantic model with `with_structured_output()` for guaranteed valid JSON.
    """
    text = page_text[:MAX_TEXT_FOR_LLM] if len(page_text) > MAX_TEXT_FOR_LLM else page_text

    if not text.strip():
        logger.warning("No text content to analyze")
        return {"description": None, "value_proposition": None, "target_audience": None, "industry": None}

    company_context = f"Company name: {company_name}\n" if company_name else ""

    prompt = f"""Analyze this company website and extract key business information.

{company_context}Website content:
---
{text}
---

Extract:
1. description: What does this company do? (2-3 factual sentences)
2. value_proposition: What makes them unique? (1-2 sentences, or null if unclear)
3. target_audience: Who are their ideal customers? (be specific)
4. industry: Primary category like "AI/SaaS", "Healthcare Tech", "E-commerce", "FinTech", "Marketing Tech"

Be factual and specific based on the content. If something is unclear, set it to null."""

    try:
        logger.info("Starting LLM analysis for brand extraction (structured output)...")
        llm = get_llm(streaming=False)

        structured_llm = llm.with_structured_output(BrandAnalysis)
        result: BrandAnalysis = await structured_llm.ainvoke(prompt)

        extracted = {
            "description": result.description,
            "value_proposition": result.value_proposition,
            "target_audience": result.target_audience,
            "industry": result.industry,
        }
        logger.info(f"LLM extraction successful: industry={extracted.get('industry')}")
        return extracted

    except Exception as e:
        logger.error(f"LLM structured output failed: {e}", exc_info=True)

        # Fallback: try regex parsing
        try:
            logger.info("Falling back to regex JSON parsing...")
            llm = get_llm(streaming=False)
            response = await llm.ainvoke(prompt + "\n\nReturn as JSON only.")
            content = response.content if hasattr(response, "content") else str(response)

            json_match = re.search(r"\{.*\}", content, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    "description": result.get("description"),
                    "value_proposition": result.get("value_proposition"),
                    "target_audience": result.get("target_audience"),
                    "industry": result.get("industry"),
                }
        except Exception as fallback_error:
            logger.error(f"Fallback parsing also failed: {fallback_error}")

        return {"description": None, "value_proposition": None, "target_audience": None, "industry": None}


# =============================================================================
# MAIN EXTRACTION FUNCTION
# =============================================================================

async def extract_and_save_brand(url: str, org_id: str, user_id: Optional[str] = None) -> dict[str, Any]:
    """
    Extract brand information from URL and save to database.

    This is the main entry point. It:
    1. Fetches the URL
    2. Extracts reliable data (meta tags, favicon, social links)
    3. Uses LLM to analyze page text for semantic fields
    4. Saves everything to brand_settings and brand_assets
    """
    logger.info(f"Extracting brand from URL: {url} for org: {org_id}")

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    # Fetch HTML
    try:
        html, status_code = await fetch_url(url)
    except Exception as e:
        logger.error(f"Failed to fetch URL {url}: {e}")
        raise ValueError(f"Could not fetch URL: {e}")

    if status_code != 200:
        raise ValueError(f"Failed to fetch URL (HTTP {status_code})")

    soup = parse_html(html)

    # Stage 1: Reliable Extraction
    company_name = extract_company_name(soup, url) or extract_domain_name(url)
    tagline = extract_tagline(soup)
    logo_url = extract_logo_url(soup, url)
    social_links = extract_social_links(soup)
    colors = extract_colors_from_css(soup)
    fonts = extract_fonts(soup)

    logger.info(f"Reliable extraction complete: {company_name}")

    # Stage 2: LLM Analysis
    page_text = extract_text_content(soup)
    llm_fields = await analyze_with_llm(page_text, company_name)

    logger.info(f"LLM analysis complete: industry={llm_fields.get('industry')}")

    # Stage 3: Save to Database
    service = get_knowledge_service()

    settings = await service.save_brand_settings(
        org_id,
        business_name=company_name,
        website=url,
        tagline=tagline,
        colors=colors if colors else None,
        fonts=fonts if fonts else None,
        social_links=social_links if social_links else None,
        description=llm_fields.get("description"),
        value_proposition=llm_fields.get("value_proposition"),
        target_audience=llm_fields.get("target_audience"),
        industry=llm_fields.get("industry"),
        created_by=user_id,
    )

    # Save logo (download + upload to Supabase Storage)
    logo_saved = False
    logo_storage_url = None
    if logo_url and not logo_url.endswith("/favicon.ico"):
        # ... logo download/upload logic (see full file)
        pass

    logger.info(f"Brand extraction saved for org {org_id}")

    return {
        "success": True,
        "url": url,
        "extracted": {
            "business_name": company_name,
            "website": url,
            "tagline": tagline,
            "colors": colors,
            "fonts": fonts,
            "social_links": social_links,
            "description": llm_fields.get("description"),
            "value_proposition": llm_fields.get("value_proposition"),
            "target_audience": llm_fields.get("target_audience"),
            "industry": llm_fields.get("industry"),
        },
        "logo": {
            "found": bool(logo_url),
            "saved": logo_saved,
            "url": logo_storage_url or logo_url,
            "original_url": logo_url,
        },
        "settings_saved": settings is not None,
    }
*/


// =============================================================================
// SECTION 7: BACKEND - KNOWLEDGE SERVICE (services/knowledge_service.py)
// =============================================================================
// Database operations for brand settings, assets, and knowledge base
// See the full file in apps/api/app/services/knowledge_service.py
// Key classes: BrandSettings, BrandAsset, BrandContext, KnowledgeService


// =============================================================================
// FILE LOCATIONS SUMMARY
// =============================================================================
/*
FRONTEND (apps/web/src/):
- pages/KnowledgeBasePage.tsx - Main Brain page
- components/knowledge/BrandIdentityTab.tsx - Brand form (1,294 lines)
- components/knowledge/MemoryTab.tsx - Coming soon
- components/knowledge/index.ts - Exports
- lib/api.ts - API functions (lines 850-1063)

BACKEND (apps/api/app/):
- routers/knowledge.py - API endpoints (481 lines)
- services/brand_extractor.py - Web scraping + LLM (757 lines)
- services/knowledge_service.py - Database service (649 lines)
- tools/knowledge.py - Agent tools (274 lines)
- tools/research_tools.py - Research agent tools (425 lines)
- tools/seo_tools.py - SEO analysis tools (1,093 lines)
*/
