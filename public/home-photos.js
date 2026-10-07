export const HOME_PHOTOS=[
  {
    "url": "/assets/home/camp-nou-1.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-2.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-3.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-4.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-5.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-6.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-7.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-8.webp",
    "position": "center 50%"
  },
  {
    "url": "/assets/home/camp-nou-9.webp",
    "position": "center 50%"
  }
];
export function nextHomePhoto(index){return (index+1)%HOME_PHOTOS.length;}
export function homePhoto(index){return HOME_PHOTOS[Number.isInteger(index)&&index>=0&&index<HOME_PHOTOS.length?index:0];}
