from pydantic import BaseModel
from typing import List, Optional
from datetime import time, datetime

class BreakSlot(BaseModel):
    start_time: time
    duration_minutes: int

class ConfigBase(BaseModel):
    name: str = "Master Configuration"
    start_time: time
    end_time: time
    slot_duration_minutes: int
    breaks: List[BreakSlot] = []

class ConfigCreate(ConfigBase):
    pass

class ConfigUpdate(BaseModel):
    name: Optional[str] = None

class ConfigOut(ConfigBase):
    id: int
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

# --- Branch ---
class BranchBase(BaseModel):
    name: str
    config_id: Optional[int] = None

class BranchCreate(BranchBase):
    pass

class BranchUpdate(BaseModel):
    name: Optional[str] = None

class BranchOut(BranchBase):
    id: int
    class Config:
        from_attributes = True

# --- Semester ---
class SemesterBase(BaseModel):
    name: str
    branch_id: int
    config_id: Optional[int] = None

class SemesterCreate(SemesterBase):
    pass

class SemesterUpdate(BaseModel):
    name: Optional[str] = None
    branch_id: Optional[int] = None

class SemesterOut(SemesterBase):
    id: int
    class Config:
        from_attributes = True

# --- Subject ---
class SubjectBase(BaseModel):
    name: str
    semester_id: int
    weekly_hours: float
    config_id: Optional[int] = None

class SubjectCreate(SubjectBase):
    pass

class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    semester_id: Optional[int] = None
    weekly_hours: Optional[float] = None

class SubjectOut(SubjectBase):
    id: int
    class Config:
        from_attributes = True

# --- Faculty ---
class FacultyBase(BaseModel):
    name: str
    weekly_workload_minutes: int = 2400
    config_id: Optional[int] = None
    ignore_collision: bool = False

class FacultyCreate(FacultyBase):
    pass

class FacultyUpdate(BaseModel):
    name: Optional[str] = None
    weekly_workload_minutes: Optional[int] = None
    ignore_collision: Optional[bool] = None

class FacultyOut(FacultyBase):
    id: int
    class Config:
        from_attributes = True

# --- Room ---
class RoomBase(BaseModel):
    name: str
    capacity: int
    config_id: Optional[int] = None

class RoomCreate(RoomBase):
    pass

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    capacity: Optional[int] = None

class RoomOut(RoomBase):
    id: int
    class Config:
        from_attributes = True

# --- Allocation ---
class AllocationBase(BaseModel):
    config_id: Optional[int] = None
    semester_id: int
    subject_id: int
    faculty_id: int
    room_id: int
    day_of_week: str
    start_time: time
    duration_minutes: int
    batches: List[str] = []

class AllocationCreate(AllocationBase):
    pass

class AllocationUpdate(BaseModel):
    subject_id: Optional[int] = None
    faculty_id: Optional[int] = None
    room_id: Optional[int] = None
    duration_minutes: Optional[int] = None
    batches: Optional[List[str]] = None

class AllocationOut(AllocationBase):
    id: int
    class Config:
        from_attributes = True
