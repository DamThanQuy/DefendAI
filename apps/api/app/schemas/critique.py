from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

class CodeCritiqueRequest(BaseModel):
    source_code: str = Field(..., description="Mã nguồn gốc")
    ast_data: Dict[str, Any] = Field(..., description="Dữ liệu AST được trích xuất từ mã nguồn")

class CodeCritiqueResponse(BaseModel):
    critique: str = Field(..., description="Nhận xét và phản biện của AI")
    status: str = Field(default="success")
    error: Optional[str] = None
