from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


class FeedbackUserContextResponse(BaseModel):
    """Context trả về cho người dùng khi mở form feedback."""

    user_id: int
    email: str
    full_name: Optional[str] = None
    current_plan: str = "free"
    has_submitted: bool = False
    detected_features: List[str] = Field(default_factory=list)
    feature_counts: Dict[str, int] = Field(default_factory=dict)
    mock_ai_trial_tickets: int = 0
    eligible_for_feedback: bool = False

    model_config = ConfigDict(from_attributes=True)


class FeedbackCreate(BaseModel):
    """Payload người dùng gửi lên khi hoàn thành khảo sát."""

    overall_rating: int = Field(..., ge=1, le=5, description="Mức độ hài lòng chung (1-5 sao)")
    current_plan: Optional[str] = Field(None, max_length=50, description="Gói cước hiện tại (tùy chọn, hệ thống tự điền nếu để trống)")
    aspect_ratings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Đánh giá chi tiết từng khía cạnh")
    detected_features: Optional[List[str]] = Field(default_factory=list, description="Danh sách tính năng người dùng xác nhận đã dùng")
    feature_ratings: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Đánh giá riêng cho từng tính năng")
    low_rating_reasons: Optional[List[str]] = Field(default_factory=list, description="Danh sách lý do không hài lòng khi <= 3 sao")
    best_thing: Optional[str] = Field(None, description="Điều người dùng hài lòng/ấn tượng nhất")
    suggested_change: Optional[str] = Field(None, description="Góp ý cần cải thiện")
    will_recommend: Optional[Union[int, str, bool]] = Field(None, description="Điểm sẵn sàng giới thiệu NPS (0-10)")
    pay_willingness: Optional[Union[str, int]] = Field(None, description="Mức giá sẵn sàng chi trả")


class FeedbackResponse(BaseModel):
    """Dữ liệu một bản ghi feedback."""

    id: int
    user_id: int
    user_email: Optional[str] = None
    user_name: Optional[str] = None
    current_plan: str
    overall_rating: int
    aspect_ratings: Optional[Dict[str, Any]] = None
    detected_features: Optional[List[str]] = None
    feature_ratings: Optional[Dict[str, Any]] = None
    low_rating_reasons: Optional[List[str]] = None
    best_thing: Optional[str] = None
    suggested_change: Optional[str] = None
    will_recommend: Optional[int] = None
    pay_willingness: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FeedbackSubmitResult(BaseModel):
    """Kết quả sau khi nộp feedback."""

    success: bool = True
    feedback_id: int
    mock_ai_trial_tickets: int
    message: str = "Cảm ơn bạn đã phản hồi! Bạn đã nhận được 01 vé trải nghiệm Mock Room AI."


class FeedbackListResponse(BaseModel):
    """Danh sách feedback dành cho admin."""

    total: int
    items: List[FeedbackResponse]
    skip: int = 0
    limit: int = 50


class CSATStats(BaseModel):
    average_score: float
    total_responses: int
    satisfied_count: int
    satisfied_percentage: float
    rating_distribution: Dict[str, int]
    common_low_rating_reasons: List[Dict[str, Any]]


class NPSStats(BaseModel):
    score: float
    promoters_count: int
    passives_count: int
    detractors_count: int
    promoters_percentage: float
    passives_percentage: float
    detractors_percentage: float
    total_nps_responses: int
    distribution: Dict[str, int]


class AdoptionFunnelStats(BaseModel):
    registered_users: int
    workspaces_users: int
    analysis_users: int
    bookings_users: int
    meetings_users: int
    reports_users: int
    feedback_users: int
    funnel_percentages: Dict[str, float]


class WillingnessToPayStats(BaseModel):
    distribution: Dict[str, int]
    paid_count: int
    free_count: int
    paid_percentage: float
    total_responses: int


class FeedbackStatsResponse(BaseModel):
    """Tổng hợp phân tích thống kê cho admin."""

    csat: CSATStats
    nps: NPSStats
    adoption_funnel: AdoptionFunnelStats
    willingness_to_pay: WillingnessToPayStats
