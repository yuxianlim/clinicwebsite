"use client";

import { useState, useEffect } from 'react';

const Testimonials = () => {
  const testimonials = [
    { name: '赵女士', text: '困扰10年的颈椎病终于好了，针灸3个月效果显著。', rating: 5, fullText: '我因为长期对着电脑工作，颈椎问题越来越严重，曾做过CT检查，医生说椎间盘退变。李医生给我制定了个性化的针灸和中药方案，坚持了3个月，现在颈椎不痛了，头晕的症状也消失了。工作效率提高了，整个人的气质也变好了，真的非常感谢！' },
    { name: '朱先生', text: '严重失眠用中药治好了，整个人精神焕发。', rating: 5, fullText: '多年的失眠问题已经影响到了我的工作和生活，试过很多西药都有依赖性。在朋友推荐下找到这家诊所，医生仔细了解了我的体质和失眠原因，开了调理方案。坚持服用了8周，现在能睡个好觉了，整个人都显年轻了，工作效率也提高了。' },
    { name: '李女士', text: '更年期所有症状都缓解了，用中医调理真的有效。', rating: 5, fullText: '这两年因为更年期各种烦恼，潮热、易怒、失眠轮番折磨，家人都跟着我受气。王医生根据我的舌象和脉象，精心调配了中药，3个月下来，潮热大大减少，心态也平和了，家庭关系也改善了。感谢王医生的专业和耐心！' },
    { name: '陈先生', text: '长期腰痛被推拿彻底治好，已推荐给同事。', rating: 4, fullText: '腰痛有五六年了，坐时间长就疼，医生说是腰椎间盘突出。在这家诊所接受了推拿治疗，医生的手法确实专业，按了3次就明显好转，现在能正常工作了。已经推荐给公司很多同事，他们也都说效果不错。' },
    { name: '王女士', text: '宫寒导致的痛经问题用艾灸根治了。', rating: 5, fullText: '从青春期开始就痛经非常严重，每个月都要请假，吃了很多止痛药。医生诊断是宫寒，给我制定了艾灸加中药的调理方案，坚持了4个月，现在月经来完全不疼了！之前的绝望感消散了，人生质量提升很多。特别感谢医生团队！' },
    { name: '林女士', text: '不孕症经过2年调理终于怀孕成功，全家很感恩。', rating: 5, fullText: '结婚3年一直没有怀孕，西医查不出原因。王医生通过中医辨证发现我是脾虚体质，月经不调。经过2年系统的中药调理和针灸，把体质调过来了。去年终于自然怀孕了，现在宝宝已经出生，特别健康。这是我人生中最大的幸福，特别感谢王医生！' },
    { name: '张先生', text: '高血压调理后，血压现在稳定在正常范围。', rating: 5, fullText: '原来因为高血压一直吃西药，医生说可能需要终身用药。张医生给我做了体质评估，说我是"肝阳上亢"体质，制定了调理方案。坚持调理一年，现在不用吃那么多降压药了，血压稳定在正常范围，人也感觉精神了很多。改善效果真的超出了我的预期。' },
    { name: '何女士', text: '脾胃虚弱经过调理完全改善，消化好了人也瘦了。', rating: 4, fullText: '长期脾胃虚弱导致消化不好，容易胀气，经常便秘。医生给的调理方案很系统，还教了我很多食疗方法。三个多月下来，肠胃功能明显改善了，消化变好了，人也瘦了5斤。现在更相信中医调理的力量了。' },
    { name: '郭女士', text: '儿子的反复感冒问题用中医彻底解决了。', rating: 5, fullText: '儿子从幼儿园开始就反复感冒，几乎每个月都要生病。王医生给孩子调理了三个月，现在一年都没再感冒过。最神奇的是孩子的体质改变了，脸色也红润了，精力更充沛。多亏了王医生，终于让我能安心了。' },
  ];

  const [current, setCurrent] = useState(0);
  const [selectedTestimonial, setSelectedTestimonial] = useState<typeof testimonials[0] | null>(null);
  const totalGroups = Math.ceil(testimonials.length / 3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % totalGroups);
    }, 5000);
    return () => clearInterval(interval);
  }, [totalGroups]);

  const currentTestimonials = testimonials.slice(current * 3, (current + 1) * 3);

  return (
    <section id="testimonials" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">患者评价</h2>
        <div className="flex justify-center space-x-8 mb-8">
          {currentTestimonials.map((t, index) => (
            <div key={index} onClick={() => setSelectedTestimonial(t)} className="bg-white p-6 rounded-lg shadow-md flex-1 max-w-sm h-48 flex flex-col justify-between hover:shadow-2xl hover:scale-105 transition-all duration-300 cursor-pointer transform">
              <div>
                <div className="flex justify-center gap-1 mb-2">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={i < t.rating ? 'text-yellow-400 text-lg' : 'text-gray-300 text-lg'}>
                      ★
                    </span>
                  ))}
                </div>
                <p className="text-gray-600 mb-4 flex-1 text-sm">"{t.text}"</p>
              </div>
              <p className="font-semibold text-center text-sm">- {t.name}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-center space-x-2">
          {Array.from({ length: totalGroups }, (_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-3 h-3 rounded-full transition-all ${i === current ? 'bg-slate-800 w-8' : 'bg-gray-300'}`}
            />
          ))}
        </div>
      </div>

      {selectedTestimonial && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setSelectedTestimonial(null)}>
          <div className="bg-white p-8 rounded-lg shadow-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <p className="font-semibold text-gray-800">{selectedTestimonial.name}</p>
              <button
                onClick={() => setSelectedTestimonial(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="flex justify-center gap-1 mb-4">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={i < selectedTestimonial.rating ? 'text-yellow-400 text-lg' : 'text-gray-300 text-lg'}>
                  ★
                </span>
              ))}
            </div>
            <p className="text-gray-600 mb-4">{selectedTestimonial.fullText}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default Testimonials;