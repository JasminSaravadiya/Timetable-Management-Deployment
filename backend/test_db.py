import asyncio
from database import get_db, engine
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import models
import schemas

async def test():
    async for session in get_db():
        result = await session.execute(select(models.TimetableConfig).options(selectinload(models.TimetableConfig.allocations)))
        data = result.scalars().all()
        
        try:
            pub_result = await session.execute(select(models.PublishedTimetable.config_id, models.PublishedTimetable.published_at))
            rows = pub_result.all()
            pub_dict = {row.config_id: row.published_at for row in rows}
            
            for config in data:
                config.last_published_at = pub_dict.get(config.id)
                print(schemas.ConfigOut.model_validate(config).model_dump_json())
        except Exception as e:
            print("ERROR:", e)
            import traceback
            traceback.print_exc()
            
        break

if __name__ == "__main__":
    asyncio.run(test())
