import { useState } from 'react';
import FileUploader from './components/FileUploader';
import ScheduleView from './components/ScheduleView';

export default function App() {
  const [parsedData, setParsedData] = useState(null);

  return parsedData
    ? <ScheduleView data={parsedData} onReset={() => setParsedData(null)} />
    : <FileUploader onFileParsed={setParsedData} />;
}
