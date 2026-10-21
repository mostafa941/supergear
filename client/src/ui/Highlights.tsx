import { useEffect, useState } from 'react'
import { getData } from '../lib';
import { config } from '../../config';
import Container from './Container';
import type { HighlightsType } from '../../type';
import { Link } from 'react-router-dom';

function Highlights() {
  const [hightlights, setHightlights] = useState<HighlightsType[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const enpoint = `${config?.baseUrl}/highlights`;
      try {
        const data = await getData(enpoint);
        setHightlights(data || []);
      } catch (error) {
        console.log("Error Fetching data", error);
      }
    };

    fetchData();
  }, []);
  return (
    <Container className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
        {
            hightlights.map((item:HighlightsType)=>(
                <div key={item?._id} className='relative h-60 rounded-lg shadow-md cursor-pointer overflow-hidden group'>
                    <div className='absolute inset-0 bg-center bg-cover rounded-lg transition-transform duration-300 group-hover:scale-110'
                    style={{
                        backgroundImage:`url(${item?.image})`,
                        color: item?.color
                    }}
                    ></div>
               
                    <div className='relative z-10 flex flex-col justify-between h-full p-6'>
                        <div>
                            <h1 className='text-2xl font-bold max-w-44'>{item?.name}</h1>
                            <p className='text-base font-bold mt-4 text-gray-600'>{item?.title}</p>

                        </div>
                            <Link className='text-base bg-gray-700 text-white font-semibold w-fit py-2 px-8 rounded-full' to={item?._base}>{item?.buttonTitle}</Link>
                    </div>
                </div>
            ))
        }
    </Container>
  )
}

export default Highlights