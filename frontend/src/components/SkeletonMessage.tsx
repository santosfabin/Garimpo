import './SkeletonMessage.css';

interface SkeletonMessageProps {
  align: 'right' | 'left';
}

export default function SkeletonMessage({ align }: SkeletonMessageProps) {
  // Gera uma largura aleatória mais variada (entre 40% e 80%)
  const randomWidth = 40 + Math.random() * 40;

  // Gera uma altura aleatória para simular mensagens de tamanhos diferentes (entre 25px e 75px)
  const randomHeight = 70 + Math.random() * 100;

  return (
    <div className={`skeleton-message-wrapper align-${align}`}>
      <div
        className="skeleton-message"
        // Aplica tanto a largura quanto a altura aleatórias
        style={{
          width: `${randomWidth}%`,
          height: `${randomHeight}px`,
        }}
      />
    </div>
  );
}
