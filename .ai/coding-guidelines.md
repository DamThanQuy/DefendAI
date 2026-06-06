# Coding Guidelines — DefendAI

> Chi tiết quy tắc code cho AI Agent khi viết code.

## Python (Backend)

### Style
- PEP 8 với line length 100
- Type hints cho mọi public function
- Docstring theo Google style
- Imports: absolute, sorted by isort

### Naming
- Modules: `snake_case`
- Classes: `PascalCase`
- Functions: `snake_case`
- Variables: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Private: prefix `_`

### Structure
```python
# Standard imports first
import os
from typing import List

# Third-party imports
from fastapi import APIRouter

# Local imports last
from modules.assessment.service import QuestionService


@router.post("/generate-questions")
async def generate_questions(
    document_id: int,
    persona: str = "theory",
) -> dict:
    """
    Generate 10 questions based on document.
    
    Args:
        document_id: ID of uploaded document
        persona: Persona to use (theory/enterprise/strict)
    
    Returns:
        Job ID for polling
    """
    ...
```

### Async
- Dùng `async/await` cho I/O operations
- FastAPI route handlers phải async
- Dùng `asyncio.create_task` cho background jobs
- Tránh `asyncio.run()` bên trong running event loop

### Error Handling
```python
from fastapi import HTTPException, status

if not document:
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Document {document_id} not found"
    )
```

### Repository Pattern
```python
class AssessmentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def save(self, assessment: Assessment) -> Assessment:
        self.session.add(assessment)
        await self.session.commit()
        await self.session.refresh(assessment)
        return assessment
    
    async def get_by_id(self, id: int) -> Assessment | None:
        return await self.session.get(Assessment, id)
```

## TypeScript (Frontend)

### Style
- ESLint default config
- Prettier for formatting
- Functional components (no class)
- Hooks for state management

### Naming
- Files: `kebab-case.tsx`
- Components: `PascalCase`
- Hooks: `use*` prefix, `camelCase`
- Utils: `camelCase`
- Types: `PascalCase`

### Component Template
```typescript
'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'

interface QuestionListProps {
  questions: Question[]
  onSelect: (q: Question) => void
}

export function QuestionList({ questions, onSelect }: QuestionListProps) {
  const [filter, setFilter] = useState<string>('all')
  
  const { data, isLoading } = useQuery({
    queryKey: ['questions', filter],
    queryFn: () => api.getQuestions({ filter })
  })
  
  if (isLoading) return <Spinner />
  
  return (
    <div className="grid gap-4">
      {data?.map(q => (
        <QuestionCard key={q.id} question={q} onClick={onSelect} />
      ))}
    </div>
  )
}
```

### API Client
```typescript
import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 30000,
})

// Use react-query for data fetching
const { data } = useQuery({
  queryKey: ['job', jobId],
  queryFn: () => api.get(`/api/v1/assessment/jobs/${jobId}`),
  refetchInterval: 2000,
})
```

## Git Workflow

### Branch Naming
- `feature/<name>` — New feature
- `fix/<name>` — Bug fix
- `docs/<name>` — Documentation
- `dev-a/...`, `dev-b/...`, `dev-c/...` — Per developer

### Commit Messages
```
<type>(<scope>): <subject>

<body>

<footer>
```

Example: `feat(assessment): add AI question generation endpoint`

## Testing

### Python (pytest)
```python
def test_question_service_generates_10_questions():
    # Arrange
    document = create_test_document()
    service = QuestionService(ai_gateway=mock_ai)
    
    # Act
    questions = service.generate(document, persona="theory")
    
    # Assert
    assert len(questions) == 10
    assert all(q.persona == "theory" for q in questions)
```

### TypeScript (vitest)
```typescript
import { describe, it, expect } from 'vitest'
import { QuestionList } from './QuestionList'

describe('QuestionList', () => {
  it('renders 10 questions', () => {
    const questions = [/* mock */]
    render(<QuestionList questions={questions} onSelect={() => {}} />)
    expect(screen.getAllByRole('article')).toHaveLength(10)
  })
})