import { Captions } from "./Captions";

type NarrationBarProps = {
  text: string;
  progressive?: boolean;
};

export const NarrationBar: React.FC<NarrationBarProps> = ({
  text,
  progressive = true,
}) => {
  if (progressive) {
    return <Captions text={text} />;
  }
  return <Captions text={text} wordsPerSecond={999} />;
};
