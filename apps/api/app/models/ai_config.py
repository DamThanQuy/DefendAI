"""AI Provider / Model / Feature config — admin quản qua UI, lưu DB.

Kiến trúc:
- AIProvider: 1 endpoint OpenAI-compatible (base_url + api_key). Mọi nhà cung cấp
  (NVIDIA, Agnes, OpenRouter, local gateway...) đều dùng chung 1 class generic.
- AIModel: model ID admin khai báo cho 1 provider (dùng cho dropdown chọn model).
- FeatureAIConfig: mapping chức năng (chat, code_review, mock_qa...) → provider+model.

Env (LOCAL_*, NVIDIA_*) chỉ là fallback khi DB chưa có provider enabled.
"""
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint

from app.core.database import Base


class AIProvider(Base):
    """Provider OpenAI-compatible — admin thêm/sửa qua /admin."""

    __tablename__ = "ai_providers"

    id = Column(Integer, primary_key=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    base_url = Column(String(500), nullable=False)
    api_key = Column(String(500), nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AIModel(Base):
    """Model ID thuộc 1 provider — dropdown chọn model cho từng chức năng."""

    __tablename__ = "ai_models"
    __table_args__ = (
        UniqueConstraint("provider_name", "model_id", name="uq_ai_models_provider_model"),
    )

    id = Column(Integer, primary_key=True)
    provider_name = Column(
        String(50), ForeignKey("ai_providers.name", ondelete="CASCADE"), nullable=False, index=True
    )
    model_id = Column(String(200), nullable=False)
    label = Column(String(200), nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class FeatureAIConfig(Base):
    """Chức năng → (provider, model). feature là key cố định của hệ thống."""

    __tablename__ = "feature_ai_config"

    feature = Column(String(50), primary_key=True)
    provider_name = Column(String(50), nullable=False)
    model_id = Column(String(200), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
