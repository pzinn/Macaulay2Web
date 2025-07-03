FROM pzinn/m2container:latest
LABEL org.opencontainers.image.authors="Paul Zinn-Justin <pzinn@unimelb.edu.au>"

##### M2 userland
RUN mkdir /home/m2user/.ssh
COPY unix-files/ssh_config /etc/ssh/ssh_config
COPY unix-files/sshd_config.fedora /etc/ssh/sshd_config
RUN chown root:root /etc/ssh/ssh_config
RUN chmod 644 /etc/ssh/ssh_config
RUN chown root:root /etc/ssh/sshd_config
RUN chmod 600 /etc/ssh/sshd_config
RUN chown -R m2user:m2user /home/m2user/.ssh
RUN chmod 700 /home/m2user/.ssh
RUN sed -i 's/m2user:!/m2user:*/' /etc/shadow

# copy open
#COPY unix-files/open /usr/bin/open
#RUN ln -s /usr/bin/open /usr/bin/display

### Tweaks to ssh setup ###
    
# RUN mkdir /var/run/sshd
RUN sed -i 's/PermitRootLogin without-password/PermitRootLogin no/' /etc/ssh/sshd_config

# SSH login fix. Otherwise user is kicked off after login
RUN sed 's@session\s*required\s*pam_loginuid.so@session optional pam_loginuid.so@g' -i /etc/pam.d/sshd

ENV NOTVISIBLE="in users profile"
RUN echo "export VISIBLE=now" >> /etc/profile
        
EXPOSE 22
# CMD ["/usr/sbin/sshd", "-D"]

COPY id_rsa.pub /home/m2user/.ssh/authorized_keys
RUN chmod 644 /home/m2user/.ssh/authorized_keys
RUN mkdir /var/run/sshd
