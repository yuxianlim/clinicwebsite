"use client";

import { useState } from 'react';

const About = () => {
  const practitioners = [
    {
      name: '李医生',
      title: '针灸医学博士',
      summary: '20年临床经验，擅长治疗颈椎病、腰椎病等，已成功治疗5000+患者',
      bio: '李医生毕业于北京中医药大学，拥有中医学硕士学位。他在针灸领域有20年的丰富临床经验，曾任北京三甲医院针灸科主任医师。',
      fullBio: '李医生毕业于北京中医药大学，拥有中医学硕士学位，现为资深针灸医学博士。拥有20年丰富的临床经验，曾任北京大型三甲医院针灸科主任医师。他对针灸穴位的解剖原理和临床应用有深入研究，擅长运用传统针法和现代针灸技术相结合的方式进行治疗。在颈椎病、腰椎病、各类疼痛疾病的治疗上成绩显著，已成功治疗5000余名患者，患者满意度达98%以上。',
      image: 'https://randomuser.me/api/portraits/men/32.jpg',
    },
    {
      name: '王医生',
      title: '中医妇科儿科专家',
      summary: '15年妇儿专业经验，擅长月经调理、妇科疾病和儿童保健，帮助众多患者恢复健康',
      bio: '王医生毕业于上海中医药大学，拥有中医妇科硕士学位。她在妇科和儿科领域有15年的专业临床经验。',
      fullBio: '王医生毕业于上海中医药大学，获中医妇科学硕士学位。拥有15年专业的妇科和儿科临床经验，现为资深中医妇科和儿科医生。她在月经不调、更年期综合征、痛经、不孕症等妇科常见病的治疗上有独特的见解，同时擅长用纯中医方法治疗小儿积食、小儿呼吸道反复感染、小儿过敏性疾病等儿童常见疾病。王医生始终倡导自然疗法，坚持不给患者开含激素的药物。她关心每一位患者的身心健康，已帮助数千名女性和儿童恢复健康。',
      image: 'https://randomuser.me/api/portraits/women/44.jpg',
    },
    {
      name: '张医生',
      title: '中医内科学博士',
      summary: '研究生学历，专攻慢性病调理和体质改善，学术成果丰硕，发表论文15+篇',
      bio: '张医生毕业于中国中医科学院研究生院，获中医内科学博士学位。他在慢性病调理领域有丰富经验。',
      fullBio: '张医生毕业于中国中医科学院研究生院，获中医内科学博士学位，现为高级中医内科医生。他在中医内科学领域深造多年，对脾胃学说、气血阴阳调理有独到研究。张医生擅长运用辨证论治的方法治疗高血压、糖尿病前期、高血脂、肥胖症等代谢性疾病，同时致力于亚健康状态的调理和体质改善。他在国家级学术期刊发表学术论文15篇以上，参与多项国家中医药研究课题。秉承\"预防重于治疗\"的理念，为患者制定详细的调理方案和饮食起居指导。',
      image: 'https://randomuser.me/api/portraits/men/55.jpg',
    },
  ];

  const [selectedPractitioner, setSelectedPractitioner] = useState<typeof practitioners[0] | null>(null);

  return (
    <section id="about" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">医师介绍</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {practitioners.map((p, index) => (
            <div
              key={index}
              onClick={() => setSelectedPractitioner(p)}
              className="text-center bg-white p-6 rounded-lg shadow-md hover:shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer transform"
            >
              <img src={p.image} alt={`${p.name} 医师照片`} className="w-32 h-32 rounded-full mx-auto mb-4 hover:ring-4 ring-slate-400 transition-all" />
              <h3 className="text-xl font-semibold mb-2 text-slate-800">{p.name}</h3>
              <p className="text-sm text-gray-500 mb-3">{p.title}</p>
              <p className="text-gray-600 min-h-[60px]">{p.summary}</p>
            </div>
          ))}
        </div>
      </div>

      {selectedPractitioner && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedPractitioner(null)}>
          <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-800">{selectedPractitioner.name}</h2>
                <p className="text-sm text-gray-500">{selectedPractitioner.title}</p>
              </div>
              <button
                onClick={() => setSelectedPractitioner(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <p className="text-gray-600 mb-4">{selectedPractitioner.fullBio}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default About;