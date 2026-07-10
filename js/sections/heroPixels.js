// 섹션: HERO PIXELS — worst-kept-secret-hero-symbols.vercel.app 프로토타입을 그대로 포팅.
// 원본은 순수 Canvas 2D 파티클 시뮬레이션(회전하는 벡터 원형 텍스트 링에서 파티클이 태어나
// 키홀 쪽으로 소용돌이치며 흘러들어가고, 밀도가 낮아질수록 채워진 심볼 → 테두리 심볼로
// 바뀜 — eye.js/pattern.js와 같은 4종 브랜드 심볼 언어)이라 공유 WebGL 캔버스(#gl)와는
// 별개로, 이 섹션 전용 2D 캔버스를 만들어 활성 구간에서만 보여준다(video-reveal의 <video>와
// 같은 DOM 오버레이 패턴).
// 원본에는 없던 것을 이번에 추가:
//   - 스크롤 진행도에 따라 키홀이 커지면서 라임 → 흰색으로 번져 화면을 완전히 덮는(whiteout)
//     연출(기존 hero.js의 키홀 확대 로직을 이 파티클 렌더러에 맞게 포팅).
//   - 키홀이 화면을 다 덮은 뒤에는 안 보이는 파티클 시뮬레이션을 건너뛰는 성능 최적화.
//   - 파티클 상한을 낮추고(28000 → 8000), 디자이너 패널(params/controls)에 원본의 모든
//     튜닝 슬라이더 + 새 키홀 파라미터를 노출(원본의 자체 패널 UI는 제거— 기존 lil-gui로 통일).

const clamp01 = v => Math.min(1, Math.max(0, v));
const hexToRgbArr = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lerpColor = (hexA, hexB, t) => {
  const a = hexToRgbArr(hexA), b = hexToRgbArr(hexB);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
};

/* Bayer 4x4 ordered-dither matrix, normalized 0..1 (reduced-motion static render) */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map(row => row.map(v => (v + 0.5) / 16));
const bayer = (x, y) => BAYER[y & 3][x & 3];
const hash2 = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000;

/* Keyhole — decoded from keyhole.svg (48x72 on a 6px grid = exact 8x12 bitmap) */
const KEYHOLE = [
  '..XXXX..', '.XXXXXX.', '.XXXXXX.', '.XXXXXX.',
  '..XXXX..', '..XXXX..', '..XXXX..', '.XXXXXX.',
  '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', 'XXXXXXXX',
].map(row => [...row].map(c => (c === 'X' ? 1 : 0)));

/* 원본 프로토타입의 circle-text.svg 그대로(WORSTKEPTSECRET 벡터 원형 텍스트) */
const CIRCLE_SVG = `<svg width="831" height="834" viewBox="0 0 831 834" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M389.172 761.151L375.866 759.06L354.079 807.652L347.971 754.668L334.665 752.576L304.094 818.475L315.627 820.29L339.104 768.021L345.399 824.968L356.144 826.658L380.112 774.468L386.209 831.384L398.039 833.246L389.177 761.146L389.172 761.151Z" fill="white"/>
<path d="M299.181 740.376C284.509 735.181 271.135 741.566 265.909 756.337C260.719 771.01 267.066 784.477 281.739 789.672C296.411 794.867 309.822 788.389 315.011 773.711C320.238 758.94 313.853 745.571 299.181 740.376ZM296.119 749.03C304.679 752.06 307.866 760.703 304.569 770.013C301.273 779.324 293.36 784.039 284.801 781.014C276.241 777.983 272.96 769.309 276.257 759.994C279.553 750.683 287.56 745.999 296.119 749.03Z" fill="white"/>
<path d="M273.289 730.925L263.509 726.168L252.29 749.228C248.842 756.316 242.875 761.736 234.175 757.5L229.955 755.45L225.548 764.51L227.79 765.601C235.505 769.356 240.622 767.958 244.789 765.324L242.416 772.715L250.939 776.862L273.289 730.92V730.925Z" fill="white"/>
<path d="M230.717 707.443C220.196 700.928 209.05 701.304 203.901 709.623C198.018 719.127 204.872 726.069 214.318 733.559C220.123 738.212 223.555 741.388 221.036 745.462C218.829 749.024 214.365 748.842 208.763 745.378C202.994 741.806 201.142 737.022 202.942 732.975L193.949 727.409C189.187 736.433 193.694 746.03 204.381 752.644C214.818 759.107 225.511 758.33 230.602 750.099C236.329 740.851 229.527 733.825 220.029 726.418C214.224 721.766 210.792 718.589 213.259 714.599C215.569 710.865 220.446 710.948 226.304 714.573C232.839 718.615 234.832 724.311 232.438 728.933L241.43 734.498C246.923 724.869 242.338 714.641 230.711 707.443H230.717Z" fill="white"/>
<path d="M197.293 684.654L189.307 678.505L183.523 686.016L189.532 690.642C192.771 693.141 193.047 695.238 190.611 698.398L174.353 719.507L163.916 711.47L158.132 718.981L168.569 727.018L159.863 738.321L168.402 744.899L177.107 733.596L184.143 739.015L189.928 731.504L182.892 726.085L199.823 704.11C205.487 696.761 205.044 690.627 197.298 684.66L197.293 684.654Z" fill="white"/>
<path d="M174.776 666.472L167.025 658.011L153.411 670.483L135.249 670.749L144.038 632.928L134.67 622.7L123.399 670.373L84.446 671.281L93.8816 681.582L142.082 680.868L115.523 705.2L123.273 713.66L174.781 666.477L174.776 666.472Z" fill="white"/>
<path d="M123.649 603.448C116.618 592.906 105.357 589.86 96.0567 593.902L102.034 602.869C107.511 601.012 112.967 603.255 116.675 608.815C121.38 615.872 119.779 623.899 112.638 628.656L112.143 628.99L90.7156 596.86L87.6434 598.91C74.8591 607.438 72.5641 621.077 80.701 633.283C89.0621 645.817 103.369 648.388 116.488 639.641C129.522 630.951 132.563 616.806 123.649 603.442V603.448ZM105.336 633.173C98.6125 636.579 91.6388 634.034 87.8729 628.39C83.6636 622.079 84.3573 615.382 90.1679 610.426L105.336 633.173Z" fill="white"/>
<path d="M127.264 574.124L122.632 564.281L97.9814 575.876C100.908 571.083 101.46 564.756 98.0648 557.532C92.1604 544.982 78.3955 540.1 64.1299 546.808C49.3219 553.771 44.8466 567.233 50.7928 579.877C54.2353 587.189 59.9154 590.361 65.4235 591.519L58.9401 595.78L62.9772 604.36L127.264 574.118V574.124ZM90.5643 563.154C94.3459 571.192 90.6634 579.538 81.4521 583.872C72.4233 588.118 63.6448 585.63 59.8633 577.597C56.04 569.471 59.7225 561.125 68.8399 556.833C78.0513 552.498 86.7358 555.028 90.5591 563.154H90.5643Z" fill="white"/>
<path d="M81.9058 517.416L78.7293 507.85L69.7318 510.839L72.1207 518.037C73.4091 521.917 72.4598 523.811 68.673 525.068L43.3914 533.465L39.2395 520.963L30.242 523.951L34.3939 536.454L20.8533 540.95L24.2489 551.179L37.7894 546.682L40.5904 555.111L49.5879 552.123L46.7869 543.694L73.1118 534.952C81.9163 532.026 84.9832 526.695 81.9006 517.416H81.9058Z" fill="white"/>
<path d="M70.4569 464.683C68.1723 449.483 58.0325 440.413 45.6968 442.27C32.078 444.314 29.9916 455.93 29.59 468.709C29.2979 478.844 28.8858 486.172 21.7817 487.242C15.267 488.222 11.209 483.382 10.0406 475.584C8.7523 466.999 12.6695 460.859 19.5441 458.919L17.8385 447.569C5.1846 449.974 -1.91951 461.136 0.453745 476.925C2.6653 491.628 12.3357 500.266 24.374 498.456C37.9929 496.411 40.0949 484.894 40.3974 472.131C40.6738 461.897 41.2841 454.543 48.5864 453.442C55.2002 452.446 59.6234 457.735 60.8856 466.122C62.3252 475.694 57.8447 482.824 49.7444 484.649L51.4656 496.098C65.121 493.642 73.0387 481.859 70.4569 464.688V464.683Z" fill="white"/>
<path d="M66.764 413.447C66.5553 400.777 58.7262 392.119 48.722 390.491L48.8994 401.267C54.5117 402.67 57.8864 407.506 57.996 414.192C58.1368 422.674 52.4462 428.557 43.866 428.698L43.2662 428.708L42.6298 390.095L38.9369 390.157C23.5708 390.413 14.2603 400.647 14.5003 415.314C14.7506 430.383 25.3911 440.283 41.1589 440.027C56.8224 439.766 67.0352 429.522 66.7692 413.457L66.764 413.447ZM35.2754 428.541C27.7748 427.77 23.2891 421.855 23.1744 415.069C23.0492 407.485 27.2532 402.227 34.8216 401.205L35.2701 428.541H35.2754Z" fill="white"/>
<path d="M70.2899 365.314C72.1155 352.368 66.112 342.76 54.8299 339.151L53.2547 350.318C58.987 352.535 62.1427 357.313 61.209 363.937C59.9833 372.632 52.3888 377.206 42.5046 375.814C32.5266 374.405 26.403 367.802 27.6131 359.206C28.5468 352.587 32.803 348.852 38.9213 348.305L40.4965 337.137C28.745 337.596 20.3891 344.685 18.5531 357.725C16.3937 373.039 25.3494 384.582 40.9607 386.777C56.7702 389.005 68.0992 380.826 70.2847 365.314H70.2899Z" fill="white"/>
<path d="M73.915 340.742L76.6169 330.205L51.7734 323.837C44.1372 321.881 37.633 317.119 40.0375 307.746L41.2007 303.202L31.4364 300.699L30.8157 303.114C28.6824 311.428 31.0765 316.159 34.493 319.716L26.7786 318.871L24.4262 328.051L73.915 340.742Z" fill="white"/>
<path d="M89.5628 291.446C94.0746 279.606 90.0271 268.663 81.3425 263.431L77.5036 273.503C82.1927 276.893 83.528 282.636 81.1443 288.88C78.1243 296.803 70.6551 300.151 62.6329 297.095L62.0748 296.881L75.8293 260.797L72.3815 259.482C58.0221 254.011 45.5768 260.051 40.3505 273.753C34.9833 287.831 41.185 300.98 55.9148 306.598C70.556 312.179 83.841 306.457 89.5628 291.446ZM54.7256 293.756C48.0544 290.251 46.0828 283.095 48.4978 276.752C51.1996 269.664 57.0571 266.347 64.4637 268.209L54.7256 293.756Z" fill="white"/>
<path d="M106.859 252.238L111.491 243.287L103.072 238.932L99.5879 245.665C97.7101 249.301 95.6916 249.943 92.1447 248.107L68.48 235.865L74.5305 224.165L66.112 219.81L60.0615 231.509L47.3868 224.953L42.4368 234.524L55.1116 241.081L51.0327 248.967L59.4512 253.322L63.5301 245.436L88.1702 258.179C96.4114 262.44 102.368 260.917 106.864 252.232L106.859 252.238Z" fill="white"/>
<path d="M129.329 214.146L138.003 203.839L107.678 160.061L156.186 182.229L164.86 171.923L124.264 111.678L116.748 120.613L149.348 167.739L97.345 143.673L90.34 151.998L122.616 199.504L70.7437 175.287L63.0346 184.451L129.334 214.156L129.329 214.146Z" fill="white"/>
<path d="M193.689 147.903C205.732 138.04 207.198 123.294 197.272 111.173C187.409 99.1289 172.601 97.585 160.557 107.448C148.513 117.312 147.11 132.135 156.974 144.179C166.9 156.301 181.645 157.766 193.689 147.903ZM187.873 140.799C180.847 146.552 171.803 144.805 165.543 137.158C159.284 129.512 159.347 120.306 166.373 114.547C173.399 108.794 182.521 110.479 188.78 118.125C195.04 125.772 194.899 135.046 187.873 140.799Z" fill="white"/>
<path d="M215.163 130.664L224.296 124.76L210.374 103.223C206.097 96.6044 204.548 88.6918 212.675 83.4394L216.613 80.894L211.141 72.4285L209.044 73.7847C201.836 78.4425 200.381 83.5437 200.48 88.4727L195.389 82.6152L187.43 87.7634L215.163 130.67V130.664Z" fill="white"/>
<path d="M257.287 106.405C268.308 100.777 273.753 91.0442 269.304 82.3336C264.219 72.3816 254.731 74.6505 243.433 78.8545C236.449 81.4156 231.953 82.7039 229.772 78.4373C227.863 74.7027 230.331 70.9785 236.199 67.9845C242.244 64.8967 247.293 65.7886 249.823 69.4294L259.243 64.615C253.99 55.8679 243.449 54.7569 232.25 60.4788C221.317 66.0651 216.451 75.6102 220.853 84.2322C225.803 93.9182 235.333 91.7379 246.589 87.4452C253.573 84.8842 258.069 83.5958 260.202 87.7738C262.2 91.6858 259.602 95.8116 253.474 98.9463C246.63 102.441 240.731 101.2 238.014 96.7609L228.594 101.575C233.987 111.256 245.113 112.633 257.287 106.416V106.405Z" fill="white"/>
<path d="M294.095 89.6098L303.495 85.9639L300.068 77.1281L292.995 79.8717C289.182 81.353 287.242 80.4976 285.802 76.7734L276.168 51.9351L288.447 47.1729L285.02 38.3371L272.741 43.0993L267.583 29.7934L257.537 33.6897L262.695 46.9956L254.418 50.2086L257.845 59.0444L266.122 55.8314L276.153 81.6972C279.506 90.3505 284.983 93.1514 294.101 89.615L294.095 89.6098Z" fill="white"/>
<path d="M321.333 79.7673L332.584 77.5193L328.964 59.4148L338.144 43.7409L365.95 70.8481L379.553 68.1306L344.601 33.8045L363.999 0L350.302 2.73837L325.954 44.3407L318.892 9.01836L307.641 11.2664L321.338 79.7621L321.333 79.7673Z" fill="white"/>
<path d="M401.716 68.5739C414.375 67.9741 422.783 59.8842 424.103 49.8331L413.337 50.3442C412.106 55.9983 407.38 59.5191 400.699 59.832C392.228 60.2337 386.172 54.7256 385.766 46.1558L385.739 45.556L424.311 43.7304L424.139 40.0428C423.414 24.6922 412.899 15.7 398.247 16.3937C383.199 17.1083 373.628 28.0461 374.374 43.793C375.115 59.4408 385.672 69.3303 401.721 68.5687L401.716 68.5739ZM385.666 37.5704C386.209 30.0542 391.983 25.386 398.758 25.0626C406.332 24.7027 411.72 28.745 412.977 36.2769L385.666 37.5704Z" fill="white"/>
<path d="M425.083 86.7723L435.912 87.7999L438.478 60.6822C441.117 65.6426 446.276 69.3407 454.225 70.0918C468.031 71.401 479.246 62.0384 480.727 46.3436C482.271 30.0542 472.96 19.3459 459.055 18.0315C451.007 17.27 445.384 20.5456 441.587 24.6975L441.216 16.9466L431.781 16.0547L425.083 86.7828V86.7723ZM453.202 60.7709C444.361 59.9311 439.052 52.5141 440.011 42.3847C440.95 32.4484 447.564 26.1631 456.405 26.9977C465.345 27.8427 470.655 35.265 469.706 45.2952C468.746 55.4298 462.148 61.6159 453.208 60.7709H453.202Z" fill="white"/>
<path d="M497.016 76.4865L506.874 78.5781L508.841 69.3042L501.424 67.729C497.423 66.8788 496.27 65.1053 497.095 61.1986L502.623 35.1346L515.507 37.8677L517.473 28.5938L504.59 25.8606L507.553 11.9028L497.011 9.66513L494.048 23.623L485.359 21.7818L483.392 31.0557L492.082 32.8969L486.324 60.0354C484.399 69.1112 487.445 74.4523 497.011 76.4813L497.016 76.4865Z" fill="white"/>
<path d="M548.383 93.0888C562.68 98.7168 575.61 94.4763 580.179 82.8708C585.223 70.0605 576.21 62.4348 565.356 55.6958C556.728 50.3703 550.589 46.3436 553.223 39.662C555.633 33.5333 561.856 32.4431 569.189 35.3328C577.269 38.5145 580.617 44.977 578.86 51.8986L589.537 56.1026C593.788 43.9443 587.68 32.2084 572.825 26.3614C558.992 20.9159 546.672 24.9687 542.212 36.2925C537.169 49.1028 546.088 56.692 556.979 63.3371C565.7 68.6991 571.761 72.9084 569.059 79.7778C566.613 86.0004 559.816 87.1844 551.925 84.0809C542.917 80.5341 538.984 73.0909 541.461 65.1627L530.69 60.9222C525.98 73.9724 532.224 86.7254 548.378 93.0836L548.383 93.0888Z" fill="white"/>
<path d="M594.596 115.46C605.591 121.761 617.03 119.466 623.55 111.699L614.203 106.343C610.124 110.447 604.246 110.87 598.445 107.547C591.086 103.328 588.947 95.4308 593.214 87.9877L593.511 87.4661L627.008 106.671L628.844 103.469C636.485 90.1366 632.459 76.9038 619.732 69.6067C606.661 62.1114 592.708 66.1903 584.868 79.8664C577.076 93.454 580.659 107.469 594.596 115.46ZM597.741 80.6853C602.243 74.6401 609.618 73.8107 615.507 77.1802C622.084 80.9514 624.452 87.2522 621.458 94.2781L597.741 80.6801V80.6853Z" fill="white"/>
<path d="M634.66 142.437C644.998 150.438 656.322 149.99 665.048 141.973L656.129 135.072C651.361 138.953 645.645 139.328 640.356 135.234C633.408 129.861 633.204 120.994 639.312 113.102C645.478 105.132 654.256 103.088 661.12 108.398C666.409 112.487 667.541 118.037 664.985 123.628L673.904 130.529C679.329 120.092 677.316 109.321 666.899 101.262C654.668 91.7953 640.204 93.8556 630.555 106.327C620.785 118.955 622.272 132.85 634.665 142.437H634.66Z" fill="white"/>
<path d="M654.214 157.746L662.054 165.288L679.835 146.808C685.301 141.128 692.645 137.81 699.619 144.523L702.999 147.773L709.988 140.512L708.189 138.78C702.003 132.829 696.708 132.579 691.931 133.799L696.469 127.504L689.636 120.932L654.209 157.746H654.214Z" fill="white"/>
<path d="M689.458 195.608C697.569 205.341 709.091 207.172 717.906 202.165L711.005 193.887C705.753 196.312 700.094 194.664 695.817 189.532C690.387 183.017 691.127 174.864 697.72 169.372L698.179 168.991L722.898 198.654L725.735 196.291C737.539 186.454 738.368 172.642 728.98 161.376C719.335 149.802 704.835 148.764 692.724 158.857C680.69 168.887 679.167 183.267 689.453 195.608H689.458ZM704.512 164.104C710.833 160.004 718.042 161.793 722.387 167.004C727.243 172.83 727.269 179.564 722.016 185.108L704.517 164.104H704.512Z" fill="white"/>
<path d="M715.199 229.846L720.749 238.259L728.661 233.038L724.483 226.706C722.23 223.289 722.653 221.218 725.986 219.017L748.221 204.34L755.477 215.335L763.389 210.114L756.134 199.118L768.042 191.258L762.106 182.266L750.198 190.126L745.305 182.714L737.393 187.935L742.285 195.347L719.132 210.63C711.386 215.742 709.811 221.688 715.194 229.846H715.199Z" fill="white"/>
<path d="M737.487 268.042L742.223 280.654L795.243 275.668L752.149 307.088L756.885 319.7L829.287 313.833L825.182 302.905L768.136 308.231L814.589 274.697L810.765 264.516L753.541 269.372L800.068 236.021L795.858 224.812L737.487 268.047V268.042Z" fill="white"/>
<path d="M763.535 356.635C766.148 371.98 778.234 380.55 793.678 377.921C809.023 375.308 817.692 363.207 815.079 347.861C812.466 332.516 800.281 323.962 784.936 326.575C769.492 329.204 760.922 341.289 763.535 356.635ZM772.585 355.096C771.062 346.145 777.055 339.151 786.793 337.492C796.531 335.833 804.501 340.449 806.029 349.4C807.552 358.351 801.575 365.444 791.837 367.098C782.099 368.751 774.108 364.041 772.585 355.091V355.096Z" fill="white"/>
<path d="M767.864 383.82L768.443 394.68L794.048 393.313C801.919 392.891 809.55 395.483 810.066 405.148L810.317 409.832L820.378 409.295L820.248 406.801C819.789 398.232 816.091 394.434 811.767 392.066L819.382 390.559L818.876 381.092L767.864 383.815V383.82Z" fill="white"/>
<path d="M767.932 432.453C767.322 444.81 773.039 454.386 782.808 454.872C793.97 455.424 796.735 446.072 798.722 434.18C799.984 426.851 801.111 422.308 805.894 422.543C810.082 422.752 812.08 426.747 811.757 433.324C811.423 440.1 808.126 444.033 803.714 444.414L803.192 454.976C813.394 454.783 819.612 446.197 820.238 433.637C820.843 421.38 814.996 412.398 805.325 411.918C794.46 411.381 791.602 420.728 789.714 432.626C788.452 439.954 787.325 444.497 782.641 444.262C778.255 444.043 775.97 439.735 776.314 432.86C776.695 425.188 780.716 420.691 785.917 420.545L786.438 409.983C775.355 409.832 768.616 418.793 767.943 432.448L767.932 432.453Z" fill="white"/>
<path d="M764.093 472.736L762.544 482.693L771.912 484.149L773.075 476.653C773.706 472.611 775.412 471.359 779.355 471.975L805.68 476.069L803.656 489.083L813.024 490.538L815.048 477.524L829.146 479.715L830.8 469.064L816.701 466.873L818.068 458.1L808.7 456.645L807.333 465.418L779.924 461.157C770.754 459.733 765.59 463.066 764.088 472.731L764.093 472.736Z" fill="white"/>
<path d="M758.971 501.226L755.226 512.075L772.673 518.104L781.561 533.95L744.116 544.241L739.589 557.354L786.876 544.549L806.233 578.369L810.792 565.163L787.2 523.122L821.249 534.884L824.994 524.035L758.971 501.231V501.226Z" fill="white"/>
<path d="M727.827 576.179C721.875 587.367 724.53 598.727 732.495 605.002L737.56 595.488C733.33 591.54 732.719 585.677 735.859 579.778C739.844 572.288 747.673 569.899 755.247 573.931L755.774 574.212L737.633 608.304L740.893 610.04C754.459 617.259 767.562 612.815 774.457 599.864C781.535 586.564 777.018 572.741 763.102 565.335C749.27 557.975 735.374 561.996 727.827 576.179ZM762.685 578.223C768.871 582.532 769.935 589.881 766.748 595.869C763.186 602.566 756.958 605.127 749.843 602.357L762.69 578.218L762.685 578.223Z" fill="white"/>
<path d="M700.292 586.877L693.824 595.624L715.731 611.819C710.119 611.517 704.287 614.031 699.546 620.451C691.3 631.603 693.532 646.041 706.212 655.414C719.372 665.142 733.345 662.69 741.654 651.46C746.458 644.961 746.557 638.452 744.961 633.053L751.794 636.741L757.432 629.12L700.302 586.882L700.292 586.877ZM708.053 624.384C713.332 617.244 722.428 616.524 730.612 622.574C738.634 628.505 740.611 637.414 735.333 644.554C729.991 651.778 720.895 652.498 712.794 646.505C704.611 640.455 702.712 631.603 708.053 624.384Z" fill="white"/>
<path d="M671.943 653.75L665.048 661.104L671.964 667.588L677.149 662.054C679.944 659.07 682.062 659.003 684.973 661.73L704.407 679.955L695.399 689.563L702.316 696.046L711.324 686.438L721.735 696.197L729.105 688.337L718.694 678.578L724.77 672.1L717.854 665.616L711.777 672.095L691.539 653.119C684.769 646.771 678.625 646.615 671.933 653.75H671.943Z" fill="white"/>
<path d="M631.144 689.088C618.923 698.404 615.856 711.663 623.419 721.578C631.77 732.526 642.953 728.766 654.345 722.971C663.368 718.349 669.987 715.183 674.348 720.895C678.343 726.132 676.053 732.015 669.784 736.798C662.883 742.061 655.612 741.581 650.605 736.49L641.482 743.449C649.682 753.38 662.883 754.235 675.579 744.554C687.403 735.541 690.314 722.903 682.933 713.222C674.582 702.274 663.478 705.972 652.149 711.85C643.047 716.534 636.303 719.539 631.827 713.671C627.775 708.356 630.278 701.93 637.023 696.787C644.721 690.919 653.124 691.409 658.622 697.632L667.828 690.611C659.102 679.825 644.961 678.557 631.155 689.088H631.144Z" fill="white"/>
<path d="M588.055 717.056C576.971 723.2 573.013 734.175 576.278 743.772L585.703 738.551C584.305 732.938 586.986 727.686 592.833 724.447C600.25 720.337 608.121 722.595 612.278 730.101L612.57 730.623L578.792 749.343L580.581 752.571C588.029 766.013 601.439 769.419 614.271 762.309C627.451 755.007 631.186 740.955 623.545 727.164C615.95 713.462 602.107 709.268 588.05 717.056H588.055ZM616.18 737.748C619.022 744.726 615.914 751.471 609.978 754.762C603.343 758.439 596.724 757.198 592.265 751.001L616.18 737.748Z" fill="white"/>
<path d="M544.273 737.335C532.078 742.035 526.596 751.956 528.933 763.566L539.453 759.514C538.603 753.427 541.242 748.346 547.481 745.942C555.675 742.786 563.363 747.199 566.952 756.509C570.577 765.914 567.781 774.473 559.681 777.597C553.442 780.002 548.112 778.098 544.654 773.018L534.133 777.07C540.251 787.116 550.506 790.971 562.795 786.235C577.227 780.675 582.954 767.238 577.284 752.524C571.542 737.628 558.888 731.707 544.273 737.341V737.335Z" fill="white"/>
<path d="M521.02 746.145L510.51 748.941L517.108 773.722C519.137 781.337 518.167 789.338 508.815 791.832L504.282 793.036L506.874 802.775L509.284 802.133C517.578 799.927 520.535 795.524 521.964 790.809L525 797.95L534.159 795.514L521.02 746.145Z" fill="white"/>
<path d="M470.399 756.702C457.871 758.611 450.349 767.53 450.078 777.665L460.734 776.043C461.371 770.295 465.71 766.3 472.319 765.293C480.706 764.015 487.299 768.866 488.593 777.347L488.681 777.936L450.506 783.757L451.064 787.408C453.38 802.602 464.771 810.452 479.272 808.241C494.168 805.972 502.55 794.095 500.177 778.505C497.814 763.019 486.287 754.277 470.405 756.697L470.399 756.702ZM489.584 785.875C489.824 793.407 484.566 798.654 477.858 799.676C470.363 800.819 464.584 797.36 462.555 789.996L489.584 785.875Z" fill="white"/>
<path d="M427.78 761.094L417.708 761.527L418.115 770.999L425.694 770.676C429.783 770.498 431.342 771.933 431.515 775.918L432.657 802.54L419.497 803.103L419.904 812.575L433.064 812.012L433.674 826.267L444.44 825.803L443.829 811.548L452.702 811.167L452.295 801.695L443.423 802.076L442.233 774.358C441.837 765.084 437.549 760.677 427.78 761.094Z" fill="white"/>
</svg>`;
const SVG_VB = { w: 831, h: 834 };

export function createHeroPixels() {
  const params = {
    px: 7, emit: 150, stepMs: 55, fall: 60, spread: 40, pile: 70, rot: 40, swirl: 65, arms: 4,
    maxParticles: 8000,
    keyholeMaxH: 3600, keyColor: '#D1F91A', holeFill: '#FFFFFF',
  };
  const controls = [
    { key: 'px', min: 4, max: 14, step: 1, info: 'Microgrid cell size (px). Triggers a rebuild.' },
    { key: 'emit', min: 10, max: 300, step: 10, info: 'Emission rate.' },
    { key: 'stepMs', min: 20, max: 240, step: 5, info: 'Flow speed — ms per grid-step (lower = faster).' },
    { key: 'fall', min: 0, max: 100, step: 5, info: 'Density falloff steepness toward the keyhole.' },
    { key: 'spread', min: 0, max: 100, step: 5, info: 'Tangential jitter.' },
    { key: 'pile', min: 0, max: 95, step: 5, info: 'Pileup near the type ring (how much pixels linger).' },
    { key: 'rot', min: 0, max: 100, step: 5, info: 'Ring rotation speed.' },
    { key: 'swirl', min: 0, max: 100, step: 5, info: 'Swirl pitch of the inward spiral path.' },
    { key: 'arms', min: 0, max: 6, step: 1, info: 'Spiral arms (0 = even emission).' },
    { key: 'maxParticles', min: 1000, max: 20000, step: 500, info: 'Hard cap on live particles (perf safety valve).' },
    { key: 'keyholeMaxH', min: 1200, max: 6000, step: 100, info: 'Keyhole height (px) at full scroll — big enough to cover the screen.' },
    { key: 'keyColor', color: true, info: 'Keyhole color at rest.' },
    { key: 'holeFill', color: true, info: 'Color the keyhole whites out to as it opens.' },
  ];

  const COLORS = { bg: '#000000', ink: '#ffffff' };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 이 섹션 전용 2D 캔버스 — 공유 WebGL 캔버스(#gl) 위에 얹혀서 활성 구간에서만 보임
  const canvas = document.createElement('canvas');
  canvas.className = 'hp-canvas';
  const ctx = canvas.getContext('2d');
  document.body.appendChild(canvas);

  let W, H, dpr, cols, rows, cx, cy;
  let ringCanvas, ringImg, ringReady = false;
  let pixCanvas, pixCtx;
  let sprites = {};
  let textCells = [];
  let ringDrawW, ringDrawH;
  let emitters = [];
  let rot = 0;
  let particles = [];
  let flashes = [];
  let staticField = [];
  let keyRect = { x: 0, y: 0, w: 0, h: 0 };
  let keyR = 0;
  let nativeHoleH = 84;
  let lastFrameT = 0, stepAcc = 0, emitAcc = 0;
  let pxCache = params.px;

  function density(q) {
    const gamma = 1 + (params.fall / 100) * 4;
    return Math.pow(1 - Math.min(1, Math.max(0, q)), gamma);
  }

  function build() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    cols = Math.ceil(W / params.px);
    rows = Math.ceil(H / params.px);
    cx = W / 2; cy = H / 2;

    const dia = Math.min(W, H) * 0.86;
    const scale = dia / Math.max(SVG_VB.w, SVG_VB.h);

    ringCanvas = document.createElement('canvas');
    ringCanvas.width = W * dpr; ringCanvas.height = H * dpr;
    const rc = ringCanvas.getContext('2d');
    rc.setTransform(dpr, 0, 0, dpr, 0, 0);
    rc.drawImage(ringImg,
      cx - (SVG_VB.w * scale) / 2, cy - (SVG_VB.h * scale) / 2,
      SVG_VB.w * scale, SVG_VB.h * scale);
    ringDrawW = SVG_VB.w * scale; ringDrawH = SVG_VB.h * scale;

    pixCanvas = document.createElement('canvas');
    pixCanvas.width = cols; pixCanvas.height = rows;
    pixCtx = pixCanvas.getContext('2d', { willReadFrequently: true });

    const makeSprite = draw => {
      const c = document.createElement('canvas');
      c.width = c.height = Math.ceil(params.px * dpr);
      const g = c.getContext('2d');
      g.scale(dpr, dpr);
      g.strokeStyle = g.fillStyle = COLORS.ink;
      draw(g, params.px);
      return c;
    };
    sprites = {
      fillSq: makeSprite((g, u) => g.fillRect(0, 0, u, u)),
      fillCi: makeSprite((g, u) => { g.beginPath(); g.arc(u / 2, u / 2, u / 2, 0, 7); g.fill(); }),
      lineCi: makeSprite((g, u) => { g.lineWidth = u * 0.18; g.beginPath(); g.arc(u / 2, u / 2, u * 0.4, 0, 7); g.stroke(); }),
      lineSq: makeSprite((g, u) => { g.lineWidth = u * 0.14; const i = u * 0.1 + g.lineWidth / 2; g.strokeRect(i, i, u - 2 * i, u - 2 * i); }),
    };

    const img = rc.getImageData(0, 0, W * dpr, H * dpr).data;
    const alphaAt = (x, y) => {
      const px2 = Math.min(W * dpr - 1, Math.max(0, Math.round(x * dpr)));
      const py2 = Math.min(H * dpr - 1, Math.max(0, Math.round(y * dpr)));
      return img[(py2 * W * dpr + px2) * 4 + 3];
    };
    const occ = new Uint8Array(cols * rows);
    let rMin = Infinity, rMax = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const sx = gx * params.px + params.px / 2;
        const sy = gy * params.px + params.px / 2;
        if (alphaAt(sx, sy) > 110) {
          occ[gy * cols + gx] = 1;
          const r = Math.hypot(sx - cx, sy - cy);
          if (r < rMin) rMin = r;
          if (r > rMax) rMax = r;
        }
      }
    }
    const band = rMax - rMin;

    keyRect = {
      x: Math.round(cx / params.px - KEYHOLE[0].length / 2),
      y: Math.round(cy / params.px - KEYHOLE.length / 2),
      w: KEYHOLE[0].length, h: KEYHOLE.length,
    };
    keyR = (keyRect.h / 2) * params.px;
    nativeHoleH = KEYHOLE.length * params.px;

    emitters.length = 0;
    const innerLimit = rMin + band * 0.34;
    for (let gy = 1; gy < rows - 1; gy++) {
      for (let gx = 1; gx < cols - 1; gx++) {
        if (!occ[gy * cols + gx]) continue;
        const sx = gx * params.px + params.px / 2;
        const sy = gy * params.px + params.px / 2;
        const r = Math.hypot(sx - cx, sy - cy);
        if (r > innerLimit) continue;
        const nx = gx + Math.sign(Math.round((cx - sx) / params.px));
        const ny = gy + Math.sign(Math.round((cy - sy) / params.px));
        if (!occ[ny * cols + nx]) {
          const ex = nx * params.px + params.px / 2 - cx;
          const ey = ny * params.px + params.px / 2 - cy;
          emitters.push({ r: Math.hypot(ex, ey), a: Math.atan2(ey, ex), r0: r });
        }
      }
    }

    particles.length = 0; flashes.length = 0;

    staticField.length = 0;
    if (reduceMotion) {
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          if (occ[gy * cols + gx]) continue;
          const sx = gx * params.px + params.px / 2;
          const sy = gy * params.px + params.px / 2;
          const r = Math.hypot(sx - cx, sy - cy);
          if (r >= rMin || r <= keyR) continue;
          const q = 1 - (r - keyR) / (rMin - keyR);
          const m = 1 - (params.pile / 100) * (1 - Math.pow(q, 0.7));
          if (bayer(gx, gy) < Math.min(1, density(q) / Math.max(m, 0.05)))
            staticField.push(gx, gy);
        }
      }
    }
  }

  function spawnOne() {
    for (let tries = 0; tries < 4; tries++) {
      const e = emitters[(Math.random() * emitters.length) | 0];
      if (params.arms > 0) {
        const w = 0.22 + 0.78 * (0.5 + 0.5 * Math.sin(params.arms * (e.a + rot)));
        if (Math.random() > w) continue;
      }
      const a = e.a + rot;
      particles.push({
        gx: Math.floor((cx + Math.cos(a) * e.r) / params.px),
        gy: Math.floor((cy + Math.sin(a) * e.r) / params.px),
        r0: e.r0, u: Math.random(), ci: Math.random() < 0.5,
        ft: 0.25 + Math.random() * 0.4,
      });
      return;
    }
  }

  function stepParticles(now, warm) {
    const kx = keyRect.x + keyRect.w / 2, ky = keyRect.y + keyRect.h / 2;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const dx = kx - p.gx, dy = ky - p.gy;
      if (Math.abs(dx) <= keyRect.w / 2 && Math.abs(dy) <= keyRect.h / 2) {
        if (!warm) flashes.push({ gx: p.gx, gy: p.gy, until: now + 140 });
        particles.splice(i, 1); continue;
      }
      const rCur = Math.hypot(p.gx * params.px + params.px / 2 - cx, p.gy * params.px + params.px / 2 - cy);
      const q = 1 - (rCur - keyR) / (p.r0 - keyR);
      if (density(q) < p.u) { particles.splice(i, 1); continue; }
      const m = 1 - (params.pile / 100) * (1 - Math.pow(q, 0.7));
      if (Math.random() > m) continue;
      const ux = p.gx * params.px + params.px / 2 - cx, uy = p.gy * params.px + params.px / 2 - cy;
      const ul = Math.hypot(ux, uy) + 0.001, il = Math.hypot(dx, dy) + 0.001;
      const pitch = (params.swirl / 100) * 1.22 * (0.72 + 0.42 * q);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const dirx = cp * (dx / il) + sp * (-uy / ul), diry = cp * (dy / il) + sp * (ux / ul);
      const ax = Math.abs(dirx), ay = Math.abs(diry);
      if (Math.random() < ax / (ax + ay + 0.001)) p.gx += Math.sign(dirx);
      else p.gy += Math.sign(diry);
      if (Math.random() < params.spread / 250) {
        if (Math.random() < 0.5) p.gx += Math.random() < 0.5 ? -1 : 1;
        else p.gy += Math.random() < 0.5 ? -1 : 1;
      }
    }
  }

  function warmup() {
    if (reduceMotion) return;
    const perStep = params.stepMs * (params.emit / 100) * emitters.length * 0.0022;
    let acc = 0, prev = 0;
    for (let i = 0; i < 600; i++) {
      acc += perStep;
      while (acc >= 1 && particles.length < params.maxParticles) { acc -= 1; spawnOne(); }
      stepParticles(0, true);
      if (i > 250 && i % 25 === 0) {
        if (Math.abs(particles.length - prev) < particles.length * 0.01) break;
        prev = particles.length;
      }
    }
  }

  // 키홀이 화면을 다 덮었는지 계산해 그 뒤로는 (안 보이는) 시뮬레이션을 건너뜀 — 성능 최적화
  function drawFrame(now, holeH) {
    const dt = Math.min(64, now - lastFrameT); lastFrameT = now;
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H);

    const screenDiag = Math.hypot(W, H);
    const hidden = holeH > screenDiag * 0.72;

    if (!hidden) {
      if (!reduceMotion) rot += (dt / 1000) * (params.rot / 100) * 2.4 * Math.PI / 180;
      pixCtx.clearRect(0, 0, cols, rows);
      pixCtx.imageSmoothingEnabled = true;
      pixCtx.save();
      pixCtx.translate(cols / 2, rows / 2);
      pixCtx.rotate(rot);
      pixCtx.drawImage(ringImg, -ringDrawW / 2 / params.px, -ringDrawH / 2 / params.px, ringDrawW / params.px, ringDrawH / params.px);
      pixCtx.restore();
      const id = pixCtx.getImageData(0, 0, cols, rows);
      const d = id.data;
      textCells.length = 0;
      for (let i = 0, n = cols * rows; i < n; i++) {
        if (d[i * 4 + 3] > 110) textCells.push(i % cols, (i / cols) | 0);
      }
      for (let i = 0; i < textCells.length; i += 2) {
        const gx = textCells[i], gy = textCells[i + 1];
        const sp = hash2(gx, gy) < 0.3 ? sprites.fillCi : sprites.fillSq;
        ctx.drawImage(sp, gx * params.px, gy * params.px, params.px, params.px);
      }

      if (reduceMotion) {
        for (let i = 0; i < staticField.length; i += 2) {
          const gx = staticField[i], gy = staticField[i + 1];
          const filled = hash2(gx, gy) < 0.5;
          const sp = filled ? (hash2(gy, gx) < 0.5 ? sprites.fillCi : sprites.fillSq)
                             : (hash2(gy, gx) < 0.5 ? sprites.lineCi : sprites.lineSq);
          ctx.drawImage(sp, gx * params.px, gy * params.px, params.px, params.px);
        }
      } else {
        emitAcc += dt * (params.emit / 100) * emitters.length * 0.0022;
        while (emitAcc >= 1 && particles.length < params.maxParticles) { emitAcc -= 1; spawnOne(); }
        stepAcc += dt;
        if (stepAcc >= params.stepMs) { stepAcc = 0; stepParticles(now); }
        for (const p of particles) {
          const rC = Math.hypot(p.gx * params.px + params.px / 2 - cx, p.gy * params.px + params.px / 2 - cy);
          const q = 1 - (rC - keyR) / (p.r0 - keyR);
          const filled = density(q) > p.ft;
          const sp = filled ? (p.ci ? sprites.fillCi : sprites.fillSq) : (p.ci ? sprites.lineCi : sprites.lineSq);
          ctx.drawImage(sp, p.gx * params.px, p.gy * params.px, params.px, params.px);
        }
      }

      ctx.fillStyle = params.keyColor;
      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        if (now > f.until) { flashes.splice(i, 1); continue; }
        ctx.fillRect(f.gx * params.px, f.gy * params.px, params.px, params.px);
      }
    }
  }

  // 스크롤에 따라 커지며 라임 → 흰색으로 whiteout되는 키홀(기존 hero.js 로직을 포팅)
  function drawKeyhole(p, holeH) {
    const holeScale = holeH / nativeHoleH;
    const openT = Math.min(1, p * 1.8);
    ctx.fillStyle = lerpColor(params.keyColor, params.holeFill, openT);
    const kcx = (keyRect.x + keyRect.w / 2) * params.px;
    const kcy = (keyRect.y + keyRect.h / 2) * params.px;
    const size = params.px * holeScale;
    for (let r = 0; r < KEYHOLE.length; r++) {
      for (let c = 0; c < KEYHOLE[0].length; c++) {
        if (!KEYHOLE[r][c]) continue;
        const cellCx = (keyRect.x + c + 0.5) * params.px;
        const cellCy = (keyRect.y + r + 0.5) * params.px;
        const dx = (cellCx - kcx) * holeScale, dy = (cellCy - kcy) * holeScale;
        ctx.fillRect(kcx + dx - size / 2, kcy + dy - size / 2, size, size);
      }
    }
  }

  const el = document.createElement('section'); el.id = 'sec-hero-pixels';

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (ringReady) { build(); warmup(); } }, 150);
  });

  ringImg = new Image();
  ringImg.onload = () => { ringReady = true; build(); warmup(); lastFrameT = performance.now(); };
  ringImg.src = URL.createObjectURL(new Blob([CIRCLE_SVG], { type: 'image/svg+xml' }));

  return {
    id: 'hero-pixels', label: 'flow · hero', hint: 'scroll ↓ — into the keyhole', el, params, controls,
    onEnter() { canvas.style.display = 'block'; },
    onLeave() { canvas.style.display = 'none'; },
    render(now, s) {
      if (!ringReady) return;
      if (pxCache !== params.px) { pxCache = params.px; build(); warmup(); }

      const range = Math.max(1, el.offsetHeight - innerHeight);
      const p = clamp01((s - el.offsetTop) / range);
      const holeH = nativeHoleH + (params.keyholeMaxH - nativeHoleH) * Math.pow(p, 1.4);

      drawFrame(now, holeH);
      drawKeyhole(p, holeH);

      // 키홀 실루엣엔 오목한 notch가 있어서, 아무리 키워도 화면 모서리가 그 notch 안에
      // 걸리면 영원히 안 덮일 수 있음 — 마무리 구간(p 0.7~1)에는 전체화면 페이드로
      // 확실하게 white out을 보장.
      const fullCoverT = clamp01((p - 0.7) / 0.3);
      if (fullCoverT > 0) {
        ctx.globalAlpha = fullCoverT;
        ctx.fillStyle = params.holeFill;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    },
  };
}
