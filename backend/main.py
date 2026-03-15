from fastapi import FastAPI, Depends, HTTPException, status, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete as sa_delete
from typing import List, Optional
from datetime import datetime, timedelta, date, time

import models
import schemas
from database import get_db, engine, Base

app = FastAPI(title="Master Timetable Generator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(models.Base.metadata.create_all)

@app.get("/")
def read_root():
    return {"message": "Welcome to Master Timetable API"}

# ═══════════════════════════════════
#  CONFIG
# ═══════════════════════════════════
@app.post("/api/config", response_model=schemas.ConfigOut)
async def create_config(config: schemas.ConfigCreate, db: AsyncSession = Depends(get_db)):
    config_dict = config.model_dump()
    config_dict['breaks'] = [b.model_dump(mode='json') for b in config.breaks]
    db_config = models.TimetableConfig(**config_dict)
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@app.get("/api/config", response_model=List[schemas.ConfigOut])
async def read_configs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.TimetableConfig))
    return result.scalars().all()

# ═══════════════════════════════════
#  BRANCH  (full CRUD)
# ═══════════════════════════════════
@app.post("/api/branches", response_model=schemas.BranchOut)
async def create_branch(branch: schemas.BranchCreate, db: AsyncSession = Depends(get_db)):
    db_branch = models.Branch(**branch.model_dump())
    db.add(db_branch)
    await db.commit()
    await db.refresh(db_branch)
    return db_branch

@app.get("/api/branches", response_model=List[schemas.BranchOut])
async def read_branches(config_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(models.Branch)
    if config_id is not None:
        query = query.filter(models.Branch.config_id == config_id)
    result = await db.execute(query)
    return result.scalars().all()

@app.put("/api/branches/{branch_id}", response_model=schemas.BranchOut)
async def update_branch(branch_id: int, data: schemas.BranchUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Branch).filter(models.Branch.id == branch_id))
    branch = result.scalars().first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(branch, k, v)
    await db.commit()
    await db.refresh(branch)
    return branch

@app.delete("/api/branches/{branch_id}")
async def delete_branch(branch_id: int, db: AsyncSession = Depends(get_db)):
    # 1. Check if Branch exists
    result = await db.execute(select(models.Branch).filter(models.Branch.id == branch_id))
    branch = result.scalars().first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    # 2. Find all Semesters under this branch
    sems_result = await db.execute(select(models.Semester).filter(models.Semester.branch_id == branch_id))
    sems = sems_result.scalars().all()
    sem_ids = [s.id for s in sems]

    # 3. Check for active allocations belonging to these semesters
    if sem_ids:
        alloc_result = await db.execute(select(models.Allocation).filter(models.Allocation.semester_id.in_(sem_ids)))
        if alloc_result.scalars().first():
            raise HTTPException(status_code=400, detail="Warning: Cannot delete branch while related timetable data exists.")

        # 4. Cascade delete manually (SQLite doesn't always handle cascades strictly based on pragmas)
        # Delete Mappings
        await db.execute(sa_delete(models.SemesterFacultyMap).where(models.SemesterFacultyMap.semester_id.in_(sem_ids)))
        await db.execute(sa_delete(models.SemesterRoomMap).where(models.SemesterRoomMap.semester_id.in_(sem_ids)))
        # Delete Subjects
        await db.execute(sa_delete(models.Subject).where(models.Subject.semester_id.in_(sem_ids)))
        # Delete Semesters
        await db.execute(sa_delete(models.Semester).where(models.Semester.branch_id == branch_id))

    # 5. Delete Branch
    await db.delete(branch)
    await db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════
#  SEMESTER  (full CRUD)
# ═══════════════════════════════════
@app.post("/api/semesters", response_model=schemas.SemesterOut)
async def create_semester(semester: schemas.SemesterCreate, db: AsyncSession = Depends(get_db)):
    db_semester = models.Semester(**semester.model_dump())
    db.add(db_semester)
    await db.commit()
    await db.refresh(db_semester)
    return db_semester

@app.get("/api/semesters", response_model=List[schemas.SemesterOut])
async def read_semesters(config_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(models.Semester)
    if config_id is not None:
        query = query.filter(models.Semester.config_id == config_id)
    result = await db.execute(query)
    return result.scalars().all()

@app.put("/api/semesters/{semester_id}", response_model=schemas.SemesterOut)
async def update_semester(semester_id: int, data: schemas.SemesterUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Semester).filter(models.Semester.id == semester_id))
    semester = result.scalars().first()
    if not semester:
        raise HTTPException(status_code=404, detail="Semester not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(semester, k, v)
    await db.commit()
    await db.refresh(semester)
    return semester

@app.delete("/api/semesters/{semester_id}")
async def delete_semester(semester_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Semester).filter(models.Semester.id == semester_id))
    semester = result.scalars().first()
    if not semester:
        raise HTTPException(status_code=404, detail="Semester not found")
        
    # Check for active allocations
    alloc_result = await db.execute(select(models.Allocation).filter(models.Allocation.semester_id == semester_id))
    if alloc_result.scalars().first():
         raise HTTPException(status_code=400, detail="Warning: Cannot delete semester while related timetable data exists.")

    # Cascade manual delete
    await db.execute(sa_delete(models.SemesterFacultyMap).where(models.SemesterFacultyMap.semester_id == semester_id))
    await db.execute(sa_delete(models.SemesterRoomMap).where(models.SemesterRoomMap.semester_id == semester_id))
    await db.execute(sa_delete(models.Subject).where(models.Subject.semester_id == semester_id))

    await db.delete(semester)
    await db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════
#  SUBJECT  (full CRUD + filter)
# ═══════════════════════════════════
@app.post("/api/subjects", response_model=schemas.SubjectOut)
async def create_subject(subject: schemas.SubjectCreate, db: AsyncSession = Depends(get_db)):
    db_subject = models.Subject(**subject.model_dump())
    db.add(db_subject)
    await db.commit()
    await db.refresh(db_subject)
    return db_subject

@app.get("/api/subjects", response_model=List[schemas.SubjectOut])
async def read_subjects(semester_id: Optional[int] = Query(None), config_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(models.Subject)
    if semester_id is not None:
        query = query.filter(models.Subject.semester_id == semester_id)
    if config_id is not None:
        query = query.filter(models.Subject.config_id == config_id)
    result = await db.execute(query)
    return result.scalars().all()

@app.put("/api/subjects/{subject_id}", response_model=schemas.SubjectOut)
async def update_subject(subject_id: int, data: schemas.SubjectUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Subject).filter(models.Subject.id == subject_id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(subject, k, v)
    await db.commit()
    await db.refresh(subject)
    return subject

@app.delete("/api/subjects/{subject_id}")
async def delete_subject(subject_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Subject).filter(models.Subject.id == subject_id))
    subject = result.scalars().first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.delete(subject)
    await db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════
#  FACULTY  (full CRUD)
# ═══════════════════════════════════
@app.post("/api/faculties", response_model=schemas.FacultyOut)
async def create_faculty(faculty: schemas.FacultyCreate, db: AsyncSession = Depends(get_db)):
    db_faculty = models.Faculty(**faculty.model_dump())
    db.add(db_faculty)
    await db.commit()
    await db.refresh(db_faculty)
    return db_faculty

@app.get("/api/faculties", response_model=List[schemas.FacultyOut])
async def read_faculties(config_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(models.Faculty)
    if config_id is not None:
        query = query.filter(models.Faculty.config_id == config_id)
    result = await db.execute(query)
    return result.scalars().all()

@app.put("/api/faculties/{faculty_id}", response_model=schemas.FacultyOut)
async def update_faculty(faculty_id: int, data: schemas.FacultyUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Faculty).filter(models.Faculty.id == faculty_id))
    faculty = result.scalars().first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(faculty, k, v)
    await db.commit()
    await db.refresh(faculty)
    return faculty

@app.delete("/api/faculties/{faculty_id}")
async def delete_faculty(faculty_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Faculty).filter(models.Faculty.id == faculty_id))
    faculty = result.scalars().first()
    if not faculty:
        raise HTTPException(status_code=404, detail="Faculty not found")
    await db.delete(faculty)
    await db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════
#  ROOM  (full CRUD)
# ═══════════════════════════════════
@app.post("/api/rooms", response_model=schemas.RoomOut)
async def create_room(room: schemas.RoomCreate, db: AsyncSession = Depends(get_db)):
    db_room = models.Room(**room.model_dump())
    db.add(db_room)
    await db.commit()
    await db.refresh(db_room)
    return db_room

@app.get("/api/rooms", response_model=List[schemas.RoomOut])
async def read_rooms(config_id: Optional[int] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(models.Room)
    if config_id is not None:
        query = query.filter(models.Room.config_id == config_id)
    result = await db.execute(query)
    return result.scalars().all()

@app.put("/api/rooms/{room_id}", response_model=schemas.RoomOut)
async def update_room(room_id: int, data: schemas.RoomUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Room).filter(models.Room.id == room_id))
    room = result.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(room, k, v)
    await db.commit()
    await db.refresh(room)
    return room

@app.delete("/api/rooms/{room_id}")
async def delete_room(room_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Room).filter(models.Room.id == room_id))
    room = result.scalars().first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    await db.delete(room)
    await db.commit()
    return {"status": "deleted"}

# ═══════════════════════════════════
#  MAPPINGS  (faculty & room ↔ semester)
# ═══════════════════════════════════
from pydantic import BaseModel

class FacultyMapping(BaseModel):
    semester_id: int
    faculty_id: int

@app.post("/api/mappings/faculty")
async def map_faculty(mapping: FacultyMapping, db: AsyncSession = Depends(get_db)):
    # Prevent duplicate mappings
    existing = await db.execute(
        select(models.SemesterFacultyMap).filter(
            models.SemesterFacultyMap.semester_id == mapping.semester_id,
            models.SemesterFacultyMap.faculty_id == mapping.faculty_id,
        )
    )
    if existing.scalars().first():
        return {"status": "already_mapped"}
    db_map = models.SemesterFacultyMap(semester_id=mapping.semester_id, faculty_id=mapping.faculty_id)
    db.add(db_map)
    await db.commit()
    return {"status": "success"}

@app.get("/api/mappings/faculty/{semester_id}")
async def get_mapped_faculties(semester_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Faculty).join(models.SemesterFacultyMap).filter(models.SemesterFacultyMap.semester_id == semester_id)
    )
    return result.scalars().all()

@app.delete("/api/mappings/faculty/{semester_id}/{faculty_id}")
async def unmap_faculty(semester_id: int, faculty_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.SemesterFacultyMap).filter(
            models.SemesterFacultyMap.semester_id == semester_id,
            models.SemesterFacultyMap.faculty_id == faculty_id,
        )
    )
    mapping = result.scalars().first()
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    await db.delete(mapping)
    await db.commit()
    return {"status": "deleted"}

class RoomMapping(BaseModel):
    semester_id: int
    room_id: int

@app.post("/api/mappings/room")
async def map_room(mapping: RoomMapping, db: AsyncSession = Depends(get_db)):
    db_map = models.SemesterRoomMap(semester_id=mapping.semester_id, room_id=mapping.room_id)
    db.add(db_map)
    await db.commit()
    return {"status": "success"}

@app.get("/api/mappings/room/{semester_id}")
async def get_mapped_rooms(semester_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(models.Room).join(models.SemesterRoomMap).filter(models.SemesterRoomMap.semester_id == semester_id)
    )
    return result.scalars().all()

# ═══════════════════════════════════
#  ALLOCATIONS & COLLISION LOGIC
# ═══════════════════════════════════
def add_minutes(t: time, mins: int) -> time:
    dt = datetime.combine(date.today(), t) + timedelta(minutes=mins)
    return dt.time()

def check_overlap(start1: time, end1: time, start2: time, end2: time) -> bool:
    return max(start1, start2) < min(end1, end2)

@app.post("/api/allocations", response_model=schemas.AllocationOut)
async def create_allocation(allocation: schemas.AllocationCreate, db: AsyncSession = Depends(get_db)):
    new_start = allocation.start_time
    new_end = add_minutes(new_start, allocation.duration_minutes)

    result = await db.execute(select(models.Allocation).filter(models.Allocation.day_of_week == allocation.day_of_week))
    existing_allocations = result.scalars().all()

    for ext in existing_allocations:
        ext_start = ext.start_time
        ext_end = add_minutes(ext_start, ext.duration_minutes)

        if check_overlap(new_start, new_end, ext_start, ext_end):
            if ext.faculty_id == allocation.faculty_id:
                raise HTTPException(status_code=400, detail="This faculty is already assigned to another session in this time slot.")
            if ext.semester_id == allocation.semester_id:
                # If either has no batches specific, it implies the entire semester is occupied
                if not ext.batches or not allocation.batches:
                    raise HTTPException(status_code=400, detail="Semester/Batch collision detected (full class overlap)!")
                # If they both have batches, check for intersection
                if set(ext.batches).intersection(set(allocation.batches)):
                    raise HTTPException(status_code=400, detail="Semester/Batch collision detected among overlapping batches!")

    db_allocation = models.Allocation(**allocation.model_dump())
    db.add(db_allocation)
    await db.commit()
    await db.refresh(db_allocation)
    return db_allocation

@app.get("/api/allocations", response_model=List[schemas.AllocationOut])
async def read_allocations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Allocation))
    return result.scalars().all()

# ═══════════════════════════════════
#  EXPORT
# ═══════════════════════════════════
@app.get("/api/export")
async def get_export_data(db: AsyncSession = Depends(get_db)):
    allocations = (await db.execute(select(models.Allocation))).scalars().all()
    return allocations
