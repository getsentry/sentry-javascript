import { Link } from 'react-router-dom';

const Index = () => {
  return (
    <>
      <Link to="/projects/123/views/456/789" id="navigation">
        navigate
      </Link>
    </>
  );
};

export default Index;
