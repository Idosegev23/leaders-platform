FROM gotenberg/gotenberg:8

USER root
# Bundle Hebrew web font (Heebo) so RTL slides render identically to the editor.
RUN mkdir -p /usr/share/fonts/truetype/heebo
ADD https://github.com/google/fonts/raw/main/ofl/heebo/Heebo%5Bwght%5D.ttf /usr/share/fonts/truetype/heebo/Heebo.ttf
RUN chmod 644 /usr/share/fonts/truetype/heebo/Heebo.ttf && fc-cache -f
USER gotenberg
